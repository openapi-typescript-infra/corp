FROM google/cloud-sdk:slim

ARG TERRAFORM_VERSION=1.9.8

RUN apt-get update && \
    apt-get install -y --no-install-recommends unzip make && \
    curl -fsSL "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip" -o /tmp/terraform.zip && \
    unzip /tmp/terraform.zip -d /usr/local/bin && \
    rm /tmp/terraform.zip && \
    apt-get remove -y unzip && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /terraform

ENTRYPOINT ["/bin/bash"]
