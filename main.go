package main

import (
	"crypto/subtle"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

type NodeData struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	IPv4         string    `json:"ipv4"`
	IPv6         string    `json:"ipv6"`
	V4Status     bool      `json:"v4Status"`
	V6Status     any       `json:"v6Status"`
	CpuCores     int       `json:"cpuCores"`
	CpuUsage     float64   `json:"cpuUsage"`
	RamUsed      float64   `json:"ramUsed"`
	RamTotal     float64   `json:"ramTotal"`
	DiskUsed     float64   `json:"diskUsed"`
	DiskTotal    float64   `json:"diskTotal"`
	Uptime       string    `json:"uptime"`
	Load         []float64 `json:"load"`
	NetUpSpeed   float64   `json:"netUpSpeed"`
	NetDownSpeed float64   `json:"netDownSpeed"`
	TotalSent    float64   `json:"totalSent"`
	TotalRecv    float64   `json:"totalRecv"`
	LastUpdate   time.Time `json:"-"`
}

var (
	nodesMu      sync.RWMutex
	nodes        = make(map[string]*NodeData)
	agentSecret  string
	webPassword  string
	sessionToken = "node_monitor_auth_token_xyz"
)

func init() {
	// 从环境变量读取密钥，若未设置则使用默认安全占位符
	agentSecret = os.Getenv("AGENT_SECRET_TOKEN")
	if agentSecret == "" {
		agentSecret = "YOUR_AGENT_SECRET_TOKEN"
	}

	webPassword = os.Getenv("WEB_PASSWORD")
	if webPassword == "" {
		webPassword = "your_secure_password"
	}
}

func main() {
	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/", fs)

	http.HandleFunc("/api/login", handleLogin)
	http.HandleFunc("/api/nodes", authMiddleware(handleGetNodes))
	http.HandleFunc("/api/report", handleReport)

	// 离线巡检协程：15秒未上报自动标为 Offline 归零
	go func() {
		for {
			time.Sleep(5 * time.Second)
			nodesMu.Lock()
			for _, node := range nodes {
				if time.Since(node.LastUpdate) > 15*time.Second {
					node.CpuUsage = 0
					node.NetUpSpeed = 0
					node.NetDownSpeed = 0
					node.Uptime = "Offline"
				}
			}
			nodesMu.Unlock()
		}
	}()

	log.Println("Node-Monitor Server started securely on :6000")
	log.Fatal(http.ListenAndServe(":6000", nil))
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	if subtle.ConstantTimeCompare([]byte(req.Password), []byte(webPassword)) == 1 {
		w.Header().Set("Content-Type", "application/json")
		// 修复：使用 json.NewEncoder(w).Encode 写入响应
		json.NewEncoder(w).Encode(map[string]string{"token": sessionToken})
	} else {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
	}
}

func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+sessionToken {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func handleReport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if r.Header.Get("Authorization") != "Bearer "+agentSecret {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var data NodeData
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	data.LastUpdate = time.Now()
	nodesMu.Lock()
	nodes[data.ID] = &data
	nodesMu.Unlock()

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"success"}`))
}

func handleGetNodes(w http.ResponseWriter, r *http.Request) {
	nodesMu.RLock()
	defer nodesMu.RUnlock()

	list := make([]*NodeData, 0, len(nodes))
	for _, node := range nodes {
		list = append(list, node)
	}

	w.Header().Set("Content-Type", "application/json")
	// 修复：使用 json.NewEncoder(w).Encode 写入响应
	json.NewEncoder(w).Encode(list)
}