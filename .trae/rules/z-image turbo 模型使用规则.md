# ModelScope Z-Image-Turbo 文生图 API 调用指南

## 基本信息

| 项目 | 值 |
|------|-----|
| API 端点 | `https://api-inference.modelscope.cn/v1/images/generations` |
| 任务查询端点 | `https://api-inference.modelscope.cn/v1/tasks/{task_id}` |
| 模型 ID | `Tongyi-MAI/Z-Image-Turbo` |
| API Key | `ms-f76bd564-e3d6-4215-8e8c-13a3366c1733` |
| 调用模式 | 异步（提交任务 → 轮询结果） |
| 免费额度 | 每天 2000 次（所有模型共享） |

## 参数说明

### 提交生成请求参数

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| model | string | 是 | 模型 ID | `Tongyi-MAI/Z-Image-Turbo` |
| prompt | string | 是 | 图片描述提示词，中英文均可 | `一只穿宇航服的猫咪` |
| size | string | 否 | 图片尺寸，范围 512x512~2048x2048 | `1024x1024` |
| negative_prompt | string | 否 | 负向提示词 | `lowres, blurry` |
| seed | int | 否 | 随机种子，0~2^31-1 | `42` |
| steps | int | 否 | 采样步数，1~100，Turbo 建议 8 | `8` |
| guidance | float | 否 | 引导系数，1.5~20，Turbo 建议 0 | `0` |

### 常用尺寸

| 比例 | 尺寸 | 说明 |
|------|------|------|
| 1:1 | 1024x1024 | 正方形 |
| 3:4 | 768x1024 | 竖版 |
| 4:3 | 1024x768 | 横版 |
| 9:16 | 640x1024 | 手机竖屏 |
| 16:9 | 1024x640 | 宽屏 |

## 调用流程

```
1. POST /v1/images/generations  →  提交任务，获取 task_id
2. GET  /v1/tasks/{task_id}     →  每 3~5 秒轮询一次
3. task_status == "SUCCEED"     →  从 output_images[0] 获取图片 URL
   task_status == "FAILED"      →  从 errors.message 获取错误信息
   task_status == 其他           →  继续轮询
```

## 关键请求头

| Header | 值 | 用途 |
|--------|-----|------|
| Authorization | `Bearer ms-f76bd564-e3d6-4215-8e8c-13a3366c1733` | 认证（所有请求） |
| Content-Type | `application/json` | 请求体格式（POST 请求） |
| X-ModelScope-Async-Mode | `true` | 启用异步模式（POST 请求） |
| X-ModelScope-Task-Type | `image_generation` | 任务类型（查询任务时） |

## 完整代码示例

### Python（推荐，最简方式）

```python
import requests
import json
import time

API_KEY = "ms-f76bd564-e3d6-4215-8e8c-13a3366c1733"
BASE_URL = "https://api-inference.modelscope.cn/"
MODEL = "Tongyi-MAI/Z-Image-Turbo"

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

def generate_image(prompt, size="1024x1024"):
    """提交文生图任务，返回 task_id"""
    headers = {**HEADERS, "X-ModelScope-Async-Mode": "true"}
    payload = {
        "model": MODEL,
        "prompt": prompt,
        "size": size,
    }
    resp = requests.post(
        f"{BASE_URL}v1/images/generations",
        headers=headers,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        timeout=60,
    )
    data = resp.json()
    if "task_id" in data:
        return data["task_id"]
    raise Exception(f"提交失败: {data}")

def wait_for_result(task_id, timeout=120, interval=5):
    """轮询任务状态，返回图片 URL"""
    headers = {**HEADERS, "X-ModelScope-Task-Type": "image_generation"}
    start = time.time()
    while time.time() - start < timeout:
        resp = requests.get(f"{BASE_URL}v1/tasks/{task_id}", headers=headers, timeout=60)
        data = resp.json()
        status = data.get("task_status", "")
        if status == "SUCCEED":
            return data["output_images"][0]
        elif status == "FAILED":
            raise Exception(f"生成失败: {data.get('errors', {}).get('message', '未知错误')}")
        time.sleep(interval)
    raise Exception("生成超时")

def download_image(image_url, save_path="result.png"):
    """下载图片到本地"""
    resp = requests.get(image_url, timeout=60)
    with open(save_path, "wb") as f:
        f.write(resp.content)
    return save_path

# ===== 使用示例 =====
task_id = generate_image("一只穿宇航服的猫咪站在月球上，高清细节")
print(f"任务已提交: {task_id}")

image_url = wait_for_result(task_id)
print(f"图片 URL: {image_url}")

path = download_image(image_url, "my_image.png")
print(f"已保存: {path}")
```

### Python（带重试机制，生产环境推荐）

```python
import requests
import json
import time
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

API_KEY = "ms-f76bd564-e3d6-4215-8e8c-13a3366c1733"
BASE_URL = "https://api-inference.modelscope.cn/"
MODEL = "Tongyi-MAI/Z-Image-Turbo"

# 创建带自动重试的 session（解决 SSL 间歇性错误）
session = requests.Session()
retry = Retry(total=3, backoff_factor=1, status_forcelist=[500, 502, 503, 504])
adapter = HTTPAdapter(max_retries=retry)
session.mount("https://", adapter)
session.mount("http://", adapter)

def generate_image(prompt, size="1024x1024"):
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "X-ModelScope-Async-Mode": "true",
    }
    payload = {"model": MODEL, "prompt": prompt, "size": size}
    resp = session.post(
        f"{BASE_URL}v1/images/generations",
        headers=headers,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        timeout=60,
    )
    data = resp.json()
    if "task_id" in data:
        return data["task_id"]
    raise Exception(f"提交失败: {data}")

def wait_for_result(task_id, timeout=120, interval=5):
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "X-ModelScope-Task-Type": "image_generation",
    }
    start = time.time()
    while time.time() - start < timeout:
        try:
            resp = session.get(f"{BASE_URL}v1/tasks/{task_id}", headers=headers, timeout=60)
            data = resp.json()
            status = data.get("task_status", "")
            if status == "SUCCEED":
                return data["output_images"][0]
            elif status == "FAILED":
                raise Exception(f"生成失败: {data.get('errors', {}).get('message', '未知错误')}")
        except requests.RequestException:
            pass  # 网络错误继续轮询
        time.sleep(interval)
    raise Exception("生成超时")

def download_image(image_url, save_path="result.png"):
    resp = session.get(image_url, timeout=60)
    with open(save_path, "wb") as f:
        f.write(resp.content)
    return save_path
```

### cURL

```bash
# 步骤1: 提交任务
curl -X POST "https://api-inference.modelscope.cn/v1/images/generations" \
  -H "Authorization: Bearer ms-f76bd564-e3d6-4215-8e8c-13a3366c1733" \
  -H "Content-Type: application/json" \
  -H "X-ModelScope-Async-Mode: true" \
  -d '{"model":"Tongyi-MAI/Z-Image-Turbo","prompt":"a cute cat","size":"1024x1024"}'

# 返回: {"task_id":"xxx-xxx-xxx","task_status":"SUCCEED",...}

# 步骤2: 查询结果（替换 task_id）
curl "https://api-inference.modelscope.cn/v1/tasks/YOUR_TASK_ID" \
  -H "Authorization: Bearer ms-f76bd564-e3d6-4215-8e8c-13a3366c1733" \
  -H "X-ModelScope-Task-Type: image_generation"

# 返回: {"task_status":"SUCCEED","output_images":["https://...图片URL..."],...}
```

### JavaScript / Node.js

```javascript
const API_KEY = "ms-f76bd564-e3d6-4215-8e8c-13a3366c1733";
const BASE_URL = "https://api-inference.modelscope.cn/";
const MODEL = "Tongyi-MAI/Z-Image-Turbo";

async function generateImage(prompt, size = "1024x1024") {
  // 步骤1: 提交任务
  const submitResp = await fetch(`${BASE_URL}v1/images/generations`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "X-ModelScope-Async-Mode": "true",
    },
    body: JSON.stringify({ model: MODEL, prompt, size }),
  });
  const { task_id } = await submitResp.json();

  // 步骤2: 轮询结果
  while (true) {
    const taskResp = await fetch(`${BASE_URL}v1/tasks/${task_id}`, {
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "X-ModelScope-Task-Type": "image_generation",
      },
    });
    const data = await taskResp.json();
    if (data.task_status === "SUCCEED") return data.output_images[0];
    if (data.task_status === "FAILED") throw new Error("生成失败");
    await new Promise((r) => setTimeout(r, 5000));
  }
}

// 使用
generateImage("一只穿宇航服的猫咪").then((url) => console.log("图片:", url));
```

## API 响应格式

### 提交任务响应

```json
{
  "task_id": "ffb3ad4b-e760-45b0-9053-f330fa302c6d",
  "task_status": "SUCCEED",
  "request_id": "xxx"
}
```

### 查询任务响应 — 成功

```json
{
  "task_status": "SUCCEED",
  "output_images": [
    "https://modelscope-studios.oss-cn-zhangjiakou.aliyuncs.com/aigc/text-to-image/xxx.png"
  ],
  "request_id": "xxx"
}
```

### 查询任务响应 — 失败

```json
{
  "task_status": "FAILED",
  "errors": {
    "code": 500,
    "message": "错误描述"
  },
  "request_id": "xxx"
}
```

### 查询任务响应 — 进行中

```json
{
  "task_status": "RUNNING",
  "request_id": "xxx"
}
```

## 注意事项

1. **异步模式必须** — 必须设置 `X-ModelScope-Async-Mode: true` 头，否则可能无法正确获取结果
2. **查询任务必须带 Task-Type** — 查询时必须设置 `X-ModelScope-Task-Type: image_generation` 头，否则返回 "task not found"
3. **图片 URL 有时效** — `output_images` 中的 URL 不是永久有效的，建议及时下载保存
4. **SSL 间歇性错误** — 国内网络访问 ModelScope 可能遇到 SSL EOF 错误，建议添加重试机制（3次重试 + 退避）
5. **中文提示词** — Z-Image-Turbo 对中文理解很好，可以直接使用中文提示词，无需翻译
6. **Turbo 模型特性** — guidance_scale 应为 0，steps 建议 8（9次推理步），不支持 negative_prompt
7. **免费额度** — 每天 2000 次所有模型共享，图片生成每次消耗约 1 次额度
8. **图片 URL 无 CORS** — 浏览器前端无法直接访问图片 URL，需要后端代理转发
