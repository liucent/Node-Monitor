FROM golang:1.27.3-alpine AS builder
WORKDIR /app
COPY go.mod main.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -v -o node-server main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/node-server .
COPY static ./static
EXPOSE 6000
CMD ["./node-server"]