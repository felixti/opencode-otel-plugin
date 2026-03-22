# Provider-Specific Conventions

## Table of contents

1. [OpenAI](#openai)
2. [Anthropic](#anthropic)
3. [AWS Bedrock](#aws-bedrock)
4. [Azure AI Inference](#azure-ai-inference)
5. [Choosing the right provider name](#choosing-the-right-provider-name)

---

## OpenAI

**`gen_ai.provider.name`**: `openai`

Spec: https://opentelemetry.io/docs/specs/semconv/gen-ai/openai/

### Additional attributes

| Attribute                          | Type   | Requirement | Example       |
| ---------------------------------- | ------ | ----------- | ------------- |
| `openai.request.service_tier`      | string | Conditionally required (if set) | `auto`, `default` |
| `openai.response.service_tier`     | string | Recommended | `scale`, `default` |
| `openai.response.system_fingerprint` | string | Recommended | `fp_44709d6fcb` |

### Operation names

OpenAI uses the standard `gen_ai.operation.name` values:
- `chat` for Chat Completions API
- `text_completion` for Completions API (legacy)
- `embeddings` for Embeddings API
- `retrieval` for Vector Store search
- `invoke_agent` for Assistants API runs
- `create_agent` for Assistant creation

### Responses API

OpenAI's Responses API uses `gen_ai.operation.name` = `chat` (it's a chat completion variant).

### Example span

```
chat gpt-4o
  gen_ai.operation.name: chat
  gen_ai.provider.name: openai
  gen_ai.request.model: gpt-4o
  gen_ai.response.model: gpt-4o-2024-05-13
  gen_ai.response.id: chatcmpl-abc123
  gen_ai.usage.input_tokens: 57
  gen_ai.usage.output_tokens: 128
  gen_ai.response.finish_reasons: ["stop"]
  openai.response.system_fingerprint: fp_44709d6fcb
```

---

## Anthropic

**`gen_ai.provider.name`**: `anthropic`

Spec: https://opentelemetry.io/docs/specs/semconv/gen-ai/anthropic/

### Operation names

Anthropic Messages API maps to `gen_ai.operation.name` = `chat`.

### Cache tokens

Anthropic's prompt caching is captured via:
- `gen_ai.usage.cache_creation.input_tokens` -- tokens written to cache
- `gen_ai.usage.cache_read.input_tokens` -- tokens served from cache

Both are included in the total `gen_ai.usage.input_tokens`.

### Example span

```
chat claude-sonnet-4-20250514
  gen_ai.operation.name: chat
  gen_ai.provider.name: anthropic
  gen_ai.request.model: claude-sonnet-4-20250514
  gen_ai.response.model: claude-sonnet-4-20250514
  gen_ai.usage.input_tokens: 2095
  gen_ai.usage.output_tokens: 503
  gen_ai.usage.cache_creation.input_tokens: 2048
  gen_ai.usage.cache_read.input_tokens: 0
  gen_ai.response.finish_reasons: ["end_turn"]
```

---

## AWS Bedrock

**`gen_ai.provider.name`**: `aws.bedrock`

Spec: https://opentelemetry.io/docs/specs/semconv/gen-ai/aws-bedrock/

### Additional attributes

| Attribute                          | Type   | Requirement          | Example        |
| ---------------------------------- | ------ | -------------------- | -------------- |
| `aws.bedrock.guardrail.id`         | string | Conditionally required | `sgi5gkybzqak` |
| `aws.bedrock.knowledge_base.id`    | string | Conditionally required | `XFWUPB9PAW`   |

### Guardrails

AWS Bedrock Guardrails are captured via:
- `aws.bedrock.guardrail.id` on the span
- Guardrail outcomes (blocked, redacted, allowed) surface through the provider's response

### Agent operations

For Bedrock Agents:
- `gen_ai.operation.name` = `invoke_agent`
- `gen_ai.agent.id` = the Bedrock agent ID
- `gen_ai.conversation.id` = the Bedrock session ID

For Bedrock Knowledge Bases (RAG):
- `gen_ai.operation.name` = `retrieval`
- `aws.bedrock.knowledge_base.id` = the KB identifier

### Example span

```
invoke_agent TravelBot
  gen_ai.operation.name: invoke_agent
  gen_ai.provider.name: aws.bedrock
  gen_ai.request.model: anthropic.claude-3-haiku-20240307-v1:0
  gen_ai.agent.id: AGENT123
  gen_ai.agent.name: TravelBot
  gen_ai.conversation.id: session-456
  aws.bedrock.guardrail.id: sgi5gkybzqak
```

---

## Azure AI Inference

**`gen_ai.provider.name`**: `azure.ai.inference`

Spec: https://opentelemetry.io/docs/specs/semconv/gen-ai/azure-ai-inference/

### Additional attributes

| Attribute                             | Type   | Requirement | Example                       |
| ------------------------------------- | ------ | ----------- | ----------------------------- |
| `azure.resource_provider.namespace`   | string | Recommended | `Microsoft.CognitiveServices` |

### Azure OpenAI vs Azure AI Inference

These are distinct providers:

| Service            | `gen_ai.provider.name` | When to use                          |
| ------------------ | ---------------------- | ------------------------------------ |
| Azure OpenAI       | `azure.ai.openai`      | Azure-hosted OpenAI models           |
| Azure AI Inference | `azure.ai.inference`   | Azure AI model catalog / non-OpenAI  |

### Example span

```
chat gpt-4
  gen_ai.operation.name: chat
  gen_ai.provider.name: azure.ai.inference
  gen_ai.request.model: gpt-4
  gen_ai.response.model: gpt-4-0613
  azure.resource_provider.namespace: Microsoft.CognitiveServices
  server.address: my-resource.openai.azure.com
  server.port: 443
```

---

## Choosing the right provider name

The `gen_ai.provider.name` tells observability backends which telemetry format to expect. Choose based on the API you're calling, not the underlying model:

| You're calling...                          | Use `gen_ai.provider.name` = |
| ------------------------------------------ | ---------------------------- |
| OpenAI API directly                        | `openai`                     |
| Azure-hosted OpenAI models                 | `azure.ai.openai`           |
| Azure AI model catalog                     | `azure.ai.inference`        |
| Anthropic API directly                     | `anthropic`                  |
| AWS Bedrock (any model)                    | `aws.bedrock`               |
| Google AI Studio / Gemini API              | `gcp.gemini`                |
| Google Vertex AI                           | `gcp.vertex_ai`             |
| OpenAI-compatible proxy (unknown backend)  | Use the proxy's identity     |

If you're using an OpenAI-compatible API to reach a different provider (e.g., using the OpenAI SDK to call Azure OpenAI), set `gen_ai.provider.name` to the actual provider (`azure.ai.openai`), not `openai`. The `server.address` and `gen_ai.response.model` attributes help disambiguate further.
