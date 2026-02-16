"use client";

import { useEffect, useState } from "react";

export default function DebugPage() {
  const [debugInfo, setDebugInfo] = useState<Record<string, string>>({});
  const [tokenPreview, setTokenPreview] = useState("");

  useEffect(() => {
    // 读取所有 debug 信息
    const info: Record<string, string> = {};

    // 读取 localStorage 中所有 DEBUG_* 键
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("DEBUG_")) {
        info[key] = localStorage.getItem(key) || "";
      }
    }

    // 读取 auth-token
    const token = localStorage.getItem("auth-token");
    if (token) {
      setTokenPreview(
        token.substring(0, 100) + "... (长度: " + token.length + ")"
      );
    }

    setDebugInfo(info);
  }, []);

  const handleClear = () => {
    // 清除所有 DEBUG_* 键
    const keysToDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("DEBUG_")) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => localStorage.removeItem(key));
    setDebugInfo({});
    alert("已清除调试信息");
  };

  const handleTest = async () => {
    try {
      const token = localStorage.getItem("auth-token");
      if (!token) {
        alert("没有找到 token");
        return;
      }

      const response = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log("手动测试 /api/auth/me 响应:", response.status);
      const data = await response.json();
      console.log("返回数据:", data);
      alert(`响应: ${response.status}\n\n${JSON.stringify(data, null, 2)}`);
    } catch (error) {
      alert(`错误: ${error}`);
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "monospace" }}>
      <h1>🔍 登录调试信息</h1>

      <div style={{ marginBottom: "20px" }}>
        <h2>📊 Token 信息</h2>
        <div
          style={{
            background: "#f0f0f0",
            padding: "10px",
            borderRadius: "5px",
            wordBreak: "break-all",
          }}
        >
          {tokenPreview ? tokenPreview : "❌ 没有找到 token"}
        </div>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <h2>📋 调试步骤</h2>
        {Object.keys(debugInfo).length === 0 ? (
          <p>❌ 没有调试信息，请先登录</p>
        ) : (
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ background: "#ddd" }}>
                <th
                  style={{
                    border: "1px solid #ccc",
                    padding: "8px",
                    textAlign: "left",
                  }}
                >
                  键
                </th>
                <th
                  style={{
                    border: "1px solid #ccc",
                    padding: "8px",
                    textAlign: "left",
                  }}
                >
                  值
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(debugInfo).map(([key, value]) => (
                <tr key={key}>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                    {key}
                  </td>
                  <td
                    style={{
                      border: "1px solid #ccc",
                      padding: "8px",
                      wordBreak: "break-all",
                    }}
                  >
                    {typeof value === "string" && value.length > 100
                      ? value.substring(0, 100) + "..."
                      : value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginBottom: "20px" }}>
        <h2>🧪 操作</h2>
        <button
          onClick={handleTest}
          style={{
            padding: "10px 20px",
            marginRight: "10px",
            background: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          测试 /api/auth/me
        </button>
        <button
          onClick={handleClear}
          style={{
            padding: "10px 20px",
            background: "#dc3545",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          清除调试信息
        </button>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <h2>📖 预期流程</h2>
        <ol>
          <li>✅ 登录后应该看到: DEBUG_LOGIN_STEP = &quot;3_token_saved&quot;</li>
          <li>
            ✅ 页面跳转后应该看到: DEBUG_GETUSER_STEP = &quot;3_user_received&quot;
          </li>
          <li>✅ DEBUG_USER_DATA 中应该有用户信息</li>
          <li>
            ❌ 如果看到 DEBUG_LOGIN_ERROR 或 DEBUG_GETUSER_ERROR，说明有问题
          </li>
        </ol>
      </div>
    </div>
  );
}
