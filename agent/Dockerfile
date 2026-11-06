FROM alpine:latest
RUN apk add --no-cache bash curl coreutils util-linux grep gawk
WORKDIR /app
COPY monitor.sh entrypoint.sh ./
RUN chmod +x monitor.sh entrypoint.sh
ENTRYPOINT ["./entrypoint.sh"]