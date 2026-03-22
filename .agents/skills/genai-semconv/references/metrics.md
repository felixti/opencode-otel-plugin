# GenAI Metrics Reference

## Table of contents

1. [Client metrics](#client-metrics)
2. [Server metrics](#server-metrics)
3. [Provider name well-known values](#provider-name-well-known-values)

---

## Client metrics

### `gen_ai.client.token.usage` (Histogram)

Tracks the number of input and output tokens used per operation.

- **Unit**: `{token}`
- **Requirement level**: Recommended (when token counts are available)
- **Bucket boundaries**: `[1, 4, 16, 64, 256, 1024, 4096, 16384, 65536, 262144, 1048576, 4194304, 16777216, 67108864]`

When both used and billable token counts are available, report **billable** tokens. If token counts are not efficiently available, do not add offline counting -- skip the metric.

**Required attributes:**

| Attribute                | Type   | Example       |
| ------------------------ | ------ | ------------- |
| `gen_ai.operation.name`  | string | `chat`        |
| `gen_ai.provider.name`   | string | `openai`      |
| `gen_ai.token.type`      | string | `input` or `output` |

**Conditionally required:**

| Attribute             | Condition            | Example  |
| --------------------- | -------------------- | -------- |
| `gen_ai.request.model`| If available         | `gpt-4`  |
| `server.port`         | If `server.address` set | `443` |

**Recommended:**

| Attribute               | Example            |
| ----------------------- | ------------------ |
| `gen_ai.response.model` | `gpt-4-0613`       |
| `server.address`        | `api.openai.com`   |

**`gen_ai.token.type` values:**

| Value    | Meaning                           |
| -------- | --------------------------------- |
| `input`  | Input tokens (prompt, input)      |
| `output` | Output tokens (completion, response) |

Record one histogram observation per token type. A single LLM call produces two metric recordings: one for input tokens, one for output tokens.

### `gen_ai.client.operation.duration` (Histogram)

Tracks the duration of GenAI operations.

- **Unit**: `s` (seconds)
- **Requirement level**: Required
- **Bucket boundaries**: `[0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1.28, 2.56, 5.12, 10.24, 20.48, 40.96, 81.92]`

**Required attributes:**

| Attribute                | Type   | Example  |
| ------------------------ | ------ | -------- |
| `gen_ai.operation.name`  | string | `chat`   |
| `gen_ai.provider.name`   | string | `openai` |

**Conditionally required:**

| Attribute              | Condition                 | Example      |
| ---------------------- | ------------------------- | ------------ |
| `error.type`           | If operation errored      | `timeout`    |
| `gen_ai.request.model` | If available              | `gpt-4`      |
| `server.port`          | If `server.address` set   | `443`        |

**Recommended:**

| Attribute               | Example            |
| ----------------------- | ------------------ |
| `gen_ai.response.model` | `gpt-4-0613`       |
| `server.address`        | `api.openai.com`   |

---

## Server metrics

These describe the model server's operational characteristics. They are typically emitted by the model hosting infrastructure, not by client applications.

### `gen_ai.server.request.duration` (Histogram)

End-to-end latency from the server's perspective.

- **Unit**: `s`
- **Bucket boundaries**: same as `gen_ai.client.operation.duration`

### `gen_ai.server.time_per_output_token` (Histogram)

Time per output token -- measures generation throughput.

- **Unit**: `s`
- **Bucket boundaries**: `[0.01, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.75, 1.0, 2.5]`

### `gen_ai.server.time_to_first_token` (Histogram)

Time from request to first token -- measures perceived latency.

- **Unit**: `s`
- **Bucket boundaries**: same as `gen_ai.client.operation.duration`

Server metrics share similar attributes to client metrics, plus `gen_ai.request.model` and `gen_ai.response.model`.

---

## Provider name well-known values

Use these exact values for `gen_ai.provider.name`:

| Value                | Provider                 |
| -------------------- | ------------------------ |
| `openai`             | OpenAI                   |
| `anthropic`          | Anthropic                |
| `aws.bedrock`        | AWS Bedrock              |
| `azure.ai.inference` | Azure AI Inference       |
| `azure.ai.openai`    | Azure OpenAI             |
| `cohere`             | Cohere                   |
| `deepseek`           | DeepSeek                 |
| `gcp.gemini`         | Gemini (AI Studio API)   |
| `gcp.gen_ai`         | Google GenAI (generic)   |
| `gcp.vertex_ai`      | Vertex AI                |
| `groq`               | Groq                     |
| `ibm.watsonx.ai`     | IBM Watsonx AI           |
| `mistral_ai`         | Mistral AI               |
| `perplexity`         | Perplexity               |
| `x_ai`               | xAI                      |

For providers not on this list, use a custom value following the naming pattern.
