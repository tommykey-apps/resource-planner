terraform {
  backend "s3" {
    bucket       = "tommykeyapp-tfstate"
    key          = "resource-planner/terraform.tfstate"
    region       = "ap-northeast-1"
    encrypt      = true
    use_lockfile = true
  }
}
