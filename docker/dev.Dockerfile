FROM google/cloud-sdk:slim

RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y --no-install-recommends nodejs make && \
    corepack enable && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /repo

ENTRYPOINT ["/bin/bash"]
