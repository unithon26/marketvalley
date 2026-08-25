output "network_load_balancer_id" {
  description = "OCID of the marketvalley public NLB."
  value       = oci_network_load_balancer_network_load_balancer.marketvalley.id
}

output "network_load_balancer_ip_addresses" {
  description = "Addresses assigned to the public NLB. Point the production DNS record at the public address."
  value       = oci_network_load_balancer_network_load_balancer.marketvalley.ip_addresses
}

output "nlb_network_security_group_id" {
  description = "NSG attached to the public NLB."
  value       = oci_core_network_security_group.nlb.id
}

output "backend_network_security_group_id" {
  description = "NSG that must be appended to the existing ssumcp primary VNIC without removing existing memberships."
  value       = oci_core_network_security_group.backend.id
}

output "marketvalley_data_volume_id" {
  description = "OCID of the dedicated marketvalley data volume."
  value       = oci_core_volume.marketvalley_data.id
}

output "marketvalley_data_volume_device" {
  description = "Consistent device path to format and mount during the one-time host bootstrap."
  value       = oci_core_volume_attachment.marketvalley_data.device
}
