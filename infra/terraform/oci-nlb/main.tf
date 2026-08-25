locals {
  public_listener_ports = {
    http  = 80
    https = 443
  }
  backend_ports = {
    http  = var.http_backend_port
    https = var.https_backend_port
  }
}

resource "oci_core_network_security_group" "nlb" {
  compartment_id = var.compartment_id
  display_name   = "marketvalley-public-nlb"
  vcn_id         = var.vcn_id
}

resource "oci_core_network_security_group" "backend" {
  compartment_id = var.compartment_id
  display_name   = "marketvalley-compose-backend"
  vcn_id         = var.vcn_id
}

resource "oci_core_volume" "marketvalley_data" {
  availability_domain  = var.availability_domain
  compartment_id       = var.compartment_id
  display_name         = "marketvalley-data"
  is_auto_tune_enabled = false
  size_in_gbs          = var.data_volume_size_gbs
  vpus_per_gb          = 10

  lifecycle {
    prevent_destroy = true
  }
}

resource "oci_core_volume_attachment" "marketvalley_data" {
  attachment_type                     = "paravirtualized"
  device                              = var.data_volume_device
  display_name                        = "marketvalley-data"
  instance_id                         = var.instance_id
  is_pv_encryption_in_transit_enabled = false
  is_read_only                        = false
  is_shareable                        = false
  volume_id                           = oci_core_volume.marketvalley_data.id
}

resource "oci_core_network_security_group_security_rule" "nlb_public_ingress" {
  for_each = local.public_listener_ports

  network_security_group_id = oci_core_network_security_group.nlb.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = "0.0.0.0/0"
  source_type               = "CIDR_BLOCK"
  stateless                 = false

  tcp_options {
    destination_port_range {
      min = each.value
      max = each.value
    }
  }
}

resource "oci_core_network_security_group_security_rule" "nlb_backend_egress" {
  for_each = local.backend_ports

  network_security_group_id = oci_core_network_security_group.nlb.id
  direction                 = "EGRESS"
  protocol                  = "6"
  destination               = oci_core_network_security_group.backend.id
  destination_type          = "NETWORK_SECURITY_GROUP"
  stateless                 = false

  tcp_options {
    destination_port_range {
      min = each.value
      max = each.value
    }
  }
}

resource "oci_core_network_security_group_security_rule" "backend_nlb_ingress" {
  for_each = local.backend_ports

  network_security_group_id = oci_core_network_security_group.backend.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = oci_core_network_security_group.nlb.id
  source_type               = "NETWORK_SECURITY_GROUP"
  stateless                 = false

  tcp_options {
    destination_port_range {
      min = each.value
      max = each.value
    }
  }
}

resource "oci_network_load_balancer_network_load_balancer" "marketvalley" {
  compartment_id                 = var.compartment_id
  display_name                   = "marketvalley-public"
  is_preserve_source_destination = false
  is_private                     = false
  network_security_group_ids     = [oci_core_network_security_group.nlb.id]
  subnet_id                      = var.subnet_id

  lifecycle {
    precondition {
      condition     = var.https_backend_port != var.http_backend_port
      error_message = "https_backend_port must differ from http_backend_port."
    }
  }
}

resource "oci_network_load_balancer_backend_set" "http" {
  name                     = "marketvalley-http"
  network_load_balancer_id = oci_network_load_balancer_network_load_balancer.marketvalley.id
  policy                   = "FIVE_TUPLE"
  is_preserve_source       = false

  health_checker {
    interval_in_millis = 10000
    port               = var.http_backend_port
    protocol           = "HTTP"
    retries            = 3
    return_code        = 200
    timeout_in_millis  = 3000
    url_path           = "/api/health"
  }
}

resource "oci_network_load_balancer_backend_set" "https" {
  name                     = "marketvalley-https"
  network_load_balancer_id = oci_network_load_balancer_network_load_balancer.marketvalley.id
  policy                   = "FIVE_TUPLE"
  is_preserve_source       = false

  health_checker {
    interval_in_millis = 10000
    port               = var.https_backend_port
    protocol           = "TCP"
    retries            = 3
    timeout_in_millis  = 3000
  }
}

resource "oci_network_load_balancer_backend" "http" {
  backend_set_name         = oci_network_load_balancer_backend_set.http.name
  ip_address               = var.backend_private_ip
  name                     = "ssumcp-http"
  network_load_balancer_id = oci_network_load_balancer_network_load_balancer.marketvalley.id
  port                     = var.http_backend_port
}

resource "oci_network_load_balancer_backend" "https" {
  backend_set_name         = oci_network_load_balancer_backend_set.https.name
  ip_address               = var.backend_private_ip
  name                     = "ssumcp-https"
  network_load_balancer_id = oci_network_load_balancer_network_load_balancer.marketvalley.id
  port                     = var.https_backend_port
}

resource "oci_network_load_balancer_listener" "http" {
  default_backend_set_name = oci_network_load_balancer_backend_set.http.name
  name                     = "marketvalley-http"
  network_load_balancer_id = oci_network_load_balancer_network_load_balancer.marketvalley.id
  port                     = 80
  protocol                 = "TCP"
}

resource "oci_network_load_balancer_listener" "https" {
  default_backend_set_name = oci_network_load_balancer_backend_set.https.name
  name                     = "marketvalley-https"
  network_load_balancer_id = oci_network_load_balancer_network_load_balancer.marketvalley.id
  port                     = 443
  protocol                 = "TCP"
}
