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

output "marketvalley_storage_layout" {
  description = "Zero-cost host storage layout required by the release control plane."
  value       = "boot-bind-v1"
}
