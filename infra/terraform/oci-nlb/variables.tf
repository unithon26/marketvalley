variable "region" {
  description = "OCI region containing the existing ssumcp VM."
  type        = string
  default     = "ap-chuncheon-1"
}

variable "compartment_id" {
  description = "Compartment OCID for the existing VM and new NLB resources."
  type        = string
  sensitive   = true
}

variable "availability_domain" {
  description = "Availability domain containing the existing ssumcp VM."
  type        = string
}

variable "instance_id" {
  description = "OCID of the existing ssumcp VM that receives the dedicated data volume."
  type        = string
  sensitive   = true
}

variable "data_volume_size_gbs" {
  description = "Hard storage boundary for rootless Docker, releases, and application cache."
  type        = number
  default     = 50

  validation {
    condition     = var.data_volume_size_gbs >= 50 && var.data_volume_size_gbs <= 150
    error_message = "data_volume_size_gbs must be between 50 and 150 GiB."
  }
}

variable "data_volume_device" {
  description = "OCI consistent device path reserved for the marketvalley block volume."
  type        = string
  default     = "/dev/oracleoci/oraclevdb"

  validation {
    condition     = can(regex("^/dev/oracleoci/oraclevd[b-z]$", var.data_volume_device))
    error_message = "data_volume_device must be a non-boot OCI consistent device path."
  }
}

variable "vcn_id" {
  description = "OCID of the existing ssuai_vcn."
  type        = string
  sensitive   = true
}

variable "subnet_id" {
  description = "OCID of the existing ssuai_subnet used by the public NLB."
  type        = string
  sensitive   = true
}

variable "backend_private_ip" {
  description = "Private VNIC address of the existing ssumcp VM."
  type        = string
  default     = "10.0.0.9"

  validation {
    condition     = can(cidrhost("${var.backend_private_ip}/32", 0))
    error_message = "backend_private_ip must be a valid IPv4 address."
  }
}

variable "http_backend_port" {
  description = "Rootless Caddy HTTP high port on the existing VM."
  type        = number
  default     = 13080

  validation {
    condition     = var.http_backend_port >= 1024 && var.http_backend_port <= 65535
    error_message = "http_backend_port must be between 1024 and 65535."
  }
}

variable "https_backend_port" {
  description = "Rootless Caddy HTTPS high port on the existing VM."
  type        = number
  default     = 13443

  validation {
    condition     = var.https_backend_port >= 1024 && var.https_backend_port <= 65535 && var.https_backend_port != var.http_backend_port
    error_message = "https_backend_port must be a distinct port between 1024 and 65535."
  }
}
