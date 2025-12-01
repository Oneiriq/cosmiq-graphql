FROM debian:bullseye-slim AS tools

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    jq \
    libssl1.1 \
    tzdata \
    openssl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

FROM mcr.microsoft.com/azure-cli:latest

COPY --from=tools /usr/bin/jq /usr/bin/jq
COPY --from=tools /usr/bin/openssl /usr/bin/openssl

COPY --from=tools /usr/lib/x86_64-linux-gnu/libssl.so.1.1 /usr/lib/x86_64-linux-gnu/libssl.so.1.1
COPY --from=tools /usr/lib/x86_64-linux-gnu/libcrypto.so.1.1 /usr/lib/x86_64-linux-gnu/libcrypto.so.1.1

RUN ln -s /usr/lib/x86_64-linux-gnu/libssl.so.1.1 /usr/lib/libssl.so.1.1 && \
    ln -s /usr/lib/x86_64-linux-gnu/libcrypto.so.1.1 /usr/lib/libcrypto.so.1.1 && \
    ldconfig

CMD ["tail", "-f", "/dev/null"]
