# OSS Result Import Worker

This worker moves completed ToAPIs result images into Alibaba Cloud OSS without sending image bytes through the main business server.

## Flow

```text
main server -> worker JSON payload
worker -> ToAPIs result URL
worker -> OSS results/{userId}/...
main server <- OSS public URL
```

## Main Server Environment

Set these variables in `.env`:

```env
OSS_RESULT_IMPORT_WORKER_URL=https://your-function-url
OSS_RESULT_IMPORT_WORKER_SECRET=use-a-long-random-string
```

## OSS CORS

Browser direct upload requires OSS CORS to allow your web origin to `POST` to the bucket. Configure allowed methods at least:

```text
POST, GET, HEAD
```

Allowed headers can be `*` for the first internal version. Expose headers are not required by the current client.

## Worker Environment

Deploy `workers/oss-result-import-worker.mjs` to Alibaba Cloud Function Compute or another Node 20+ runtime and set:

```env
OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
OSS_BUCKET=momo-aigc
OSS_ACCESS_KEY_ID=...
OSS_ACCESS_KEY_SECRET=...
OSS_RESULT_IMPORT_WORKER_SECRET=use-the-same-long-random-string
```

## Request Contract

```json
{
  "taskId": "tsk_img_xxx",
  "userId": 1,
  "sourceUrl": "https://toapis-result-url",
  "targetObjectKey": "results/1/2026/05/uuid.png"
}
```

## Response Contract

```json
{
  "success": true,
  "taskId": "tsk_img_xxx",
  "objectKey": "results/1/2026/05/uuid.png",
  "publicUrl": "https://momo-aigc.oss-cn-hangzhou.aliyuncs.com/results/1/2026/05/uuid.png",
  "contentType": "image/png",
  "sizeBytes": 156329
}
```
