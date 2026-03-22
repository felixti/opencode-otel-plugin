# GenAI Spans and Events Reference

## Table of contents

1. [Inference span attributes](#inference-span-attributes)
2. [Embeddings span](#embeddings-span)
3. [Retrieval span](#retrieval-span)
4. [Execute tool span](#execute-tool-span)
5. [Content capture](#content-capture)
6. [Events](#events)

---

## Inference span attributes

Represents a client call to a GenAI model for chat, text completion, or content generation.

**Span name**: `{gen_ai.operation.name} {gen_ai.request.model}`
**Span kind**: `CLIENT` (or `INTERNAL` for in-process models)

### Required

| Attribute                | Type   | Example       |
| ------------------------ | ------ | ------------- |
| `gen_ai.operation.name`  | string | `chat`        |
| `gen_ai.provider.name`   | string | `openai`      |

### Conditionally required

| Attribute                       | Type     | Condition                        | Example                          |
| ------------------------------- | -------- | -------------------------------- | -------------------------------- |
| `error.type`                    | string   | If operation errored             | `timeout`, `500`                 |
| `gen_ai.conversation.id`        | string   | When available                   | `conv_5j66UpCpwteGg4YSxUnt7lPY` |
| `gen_ai.output.type`            | string   | If request specifies output type | `text`, `json`, `image`          |
| `gen_ai.request.choice.count`   | int      | If available and != 1            | `3`                              |
| `gen_ai.request.model`          | string   | If available                     | `gpt-4`                          |
| `gen_ai.request.seed`           | int      | If request includes seed         | `100`                            |
| `server.port`                   | int      | If `server.address` is set       | `443`                            |

### Recommended

| Attribute                                  | Type     | Example                 |
| ------------------------------------------ | -------- | ----------------------- |
| `gen_ai.request.frequency_penalty`         | double   | `0.1`                   |
| `gen_ai.request.max_tokens`                | int      | `100`                   |
| `gen_ai.request.presence_penalty`          | double   | `0.1`                   |
| `gen_ai.request.stop_sequences`            | string[] | `["forest", "lived"]`   |
| `gen_ai.request.temperature`               | double   | `0.0`                   |
| `gen_ai.request.top_k`                     | double   | `1.0`                   |
| `gen_ai.request.top_p`                     | double   | `1.0`                   |
| `gen_ai.response.finish_reasons`           | string[] | `["stop"]`              |
| `gen_ai.response.id`                       | string   | `chatcmpl-123`          |
| `gen_ai.response.model`                    | string   | `gpt-4-0613`            |
| `gen_ai.usage.cache_creation.input_tokens` | int      | `25`                    |
| `gen_ai.usage.cache_read.input_tokens`     | int      | `50`                    |
| `gen_ai.usage.input_tokens`                | int      | `100`                   |
| `gen_ai.usage.output_tokens`               | int      | `180`                   |
| `server.address`                           | string   | `api.openai.com`        |

### Opt-in (may contain PII)

| Attribute                    | Type | Content                            |
| ---------------------------- | ---- | ---------------------------------- |
| `gen_ai.system_instructions` | any  | System message / instructions      |
| `gen_ai.input.messages`      | any  | Chat history sent to model         |
| `gen_ai.output.messages`     | any  | Model response messages            |
| `gen_ai.tool.definitions`    | any  | Tool schemas available to model    |

### Sampling-critical attributes

Set these at span creation time (before the span starts recording):
- `gen_ai.operation.name`
- `gen_ai.provider.name`
- `gen_ai.request.model`
- `server.address`
- `server.port`

---

## Embeddings span

Same attribute set as inference, with `gen_ai.operation.name` = `embeddings`.

The `gen_ai.request.model` should be the embedding model name (e.g., `text-embedding-3-small`).

Token usage attributes apply -- embedding operations consume input tokens.

---

## Retrieval span

Same attribute set as inference, with `gen_ai.operation.name` = `retrieval`.

Used for vector store search or RAG retrieval operations. The `gen_ai.data_source.id` attribute (from agent spans) can identify the knowledge base being searched.

---

## Execute tool span

Represents tool execution within an agent loop.

**Span name**: `execute_tool {gen_ai.tool.name}`
**Span kind**: `INTERNAL`
**`gen_ai.operation.name`**: `execute_tool`

Additional attributes:

| Attribute              | Type   | Requirement          | Example             |
| ---------------------- | ------ | -------------------- | ------------------- |
| `gen_ai.tool.call.id`  | string | Conditionally required | `call_abc123`      |
| `gen_ai.tool.name`     | string | Conditionally required | `get_weather`      |

---

## Content capture

Input/output content can be recorded either on span attributes or as events.

### On span attributes

Use `gen_ai.input.messages`, `gen_ai.output.messages`, `gen_ai.system_instructions`. Prefer structured form; JSON strings are acceptable when structured format is unavailable.

### On events

Use the `gen_ai.client.inference.operation.details` event to record content independently from traces. This is useful when you want to store prompt/response data without bloating span attributes.

### External storage

For large payloads, content may be uploaded to external storage. The spec supports this pattern but does not prescribe a specific mechanism.

### Streaming

When the model streams responses, instrumentations should:
- Buffer the full response and record it as a single attribute/event after streaming completes
- Or record individual chunks as streaming events (if supported by the SDK)

---

## Events

### `gen_ai.client.inference.operation.details`

Records the full details of a GenAI completion including inputs, outputs, and parameters. This event is opt-in and carries the same attribute set as inference spans.

Use this event to decouple content storage from trace spans -- useful when you want content in logs but not in traces.

### `gen_ai.evaluation.result`

Records evaluation/quality metrics for a GenAI output. Attributes include:
- `gen_ai.evaluation.name` -- name of the evaluator
- `gen_ai.evaluation.score` -- numeric score
- `gen_ai.evaluation.label` -- categorical label
- `gen_ai.evaluation.explanation` -- explanation text

---

## `gen_ai.output.type` well-known values

| Value    | Meaning                        |
| -------- | ------------------------------ |
| `text`   | Plain text                     |
| `json`   | JSON object (known/unknown schema) |
| `image`  | Image                          |
| `speech` | Speech/audio                   |

## `gen_ai.operation.name` well-known values

| Value              | Meaning                      |
| ------------------ | ---------------------------- |
| `chat`             | Chat completion              |
| `text_completion`  | Text completion (legacy)     |
| `generate_content` | Multimodal generation        |
| `embeddings`       | Embedding creation           |
| `retrieval`        | Vector search / RAG          |
| `invoke_agent`     | Agent invocation             |
| `create_agent`     | Agent creation               |
| `execute_tool`     | Tool execution               |
