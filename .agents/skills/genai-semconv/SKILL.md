---
name: genai-semconv
description: "OpenTelemetry GenAI semantic conventions for instrumenting LLM, agent, and RAG applications. Use this skill whenever someone is instrumenting generative AI code with OpenTelemetry, choosing gen_ai.* span/metric/event attributes, building observability for LLM calls, agent pipelines, embeddings, retrieval, or tool execution. Also use when reviewing or debugging GenAI telemetry, setting up AI observability with Dynatrace/Jaeger/Grafana, or working with OpenLLMetry. Covers spans, metrics, events, and provider-specific conventions for OpenAI, Anthropic, AWS Bedrock, and Azure AI Inference."
---

# OpenTelemetry GenAI Semantic Conventions

These conventions (semconv v1.40.0, status: Development) standardize how generative AI operations are represented in OpenTelemetry traces, metrics, and events. They apply to LLM inference, embeddings, retrieval, agent invocations, and tool execution.

The conventions are still in development. Instrumentations on v1.36.0 or earlier should not change their default output. To opt into the latest conventions, set `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental`.

## When to read the reference files

| You need to...                                  | Read                           |
| ----------------------------------------------- | ------------------------------ |
| Instrument an LLM call (chat, completion, etc.) | `references/spans-and-events.md` |
| Instrument an agent or RAG pipeline             | `references/agent-spans.md`    |
| Set up token/duration metrics                   | `references/metrics.md`        |
| Use provider-specific attributes                | `references/providers.md`      |

## Core concepts

### Operations

Every GenAI span has a `gen_ai.operation.name`. The well-known values are:

| Operation          | Use case                                    |
| ------------------ | ------------------------------------------- |
| `chat`             | Chat completion (OpenAI Chat, Anthropic Messages) |
| `text_completion`  | Legacy text completion                      |
| `generate_content` | Multimodal generation (Gemini)              |
| `embeddings`       | Embedding creation                          |
| `retrieval`        | Vector store search / RAG retrieval         |
| `invoke_agent`     | Agent invocation                            |
| `create_agent`     | Agent creation (remote services)            |
| `execute_tool`     | Tool execution within an agent loop         |

### Span naming and kind

- **Span name**: `{gen_ai.operation.name} {gen_ai.request.model}` (e.g., `chat gpt-4`)
- **Span kind**: `CLIENT` for remote model calls, `INTERNAL` for in-process model calls
- Agent spans: `CLIENT` for remote agents, `INTERNAL` for in-process frameworks like LangChain

### Required attributes (on every GenAI span)

| Attribute                | Type   | Example                  |
| ------------------------ | ------ | ------------------------ |
| `gen_ai.operation.name`  | string | `chat`                   |
| `gen_ai.provider.name`   | string | `openai`                 |

### Core recommended attributes

| Attribute                            | Type     | When to set                  |
| ------------------------------------ | -------- | ---------------------------- |
| `gen_ai.request.model`               | string   | Always if available          |
| `gen_ai.response.model`              | string   | If response includes it      |
| `gen_ai.usage.input_tokens`          | int      | If provider returns it       |
| `gen_ai.usage.output_tokens`         | int      | If provider returns it       |
| `gen_ai.response.id`                 | string   | Unique completion ID         |
| `gen_ai.response.finish_reasons`     | string[] | `["stop"]`, `["length"]`    |
| `gen_ai.conversation.id`             | string   | When session/thread tracking |
| `gen_ai.request.temperature`         | double   | If set in request            |
| `gen_ai.request.max_tokens`          | int      | If set in request            |
| `gen_ai.request.top_p`               | double   | If set in request            |
| `error.type`                         | string   | If operation errored         |

### Opt-in content attributes (sensitive data warning)

These capture prompts and responses. They may contain PII and should only be enabled intentionally:

| Attribute                    | Content                            |
| ---------------------------- | ---------------------------------- |
| `gen_ai.system_instructions` | System message / instructions      |
| `gen_ai.input.messages`      | Full chat history sent to model    |
| `gen_ai.output.messages`     | Model response messages            |
| `gen_ai.tool.definitions`    | Tool schemas available to model    |

These follow JSON schemas defined by the spec. When recorded on events, use structured form. On spans, structured form is preferred but JSON strings are acceptable.

### Cache token attributes

| Attribute                                | Meaning                         |
| ---------------------------------------- | ------------------------------- |
| `gen_ai.usage.cache_creation.input_tokens` | Tokens written to provider cache |
| `gen_ai.usage.cache_read.input_tokens`     | Tokens served from cache         |

Both values should be included in the total `gen_ai.usage.input_tokens` count.

## Instrumentation quick-start

### Python (OpenAI example)

```python
from opentelemetry import trace
from opentelemetry.semconv.gen_ai import GenAiOperationNameValues

tracer = trace.get_tracer("my-app")

def chat_completion(messages, model="gpt-4"):
    with tracer.start_as_current_span(
        f"chat {model}",
        kind=trace.SpanKind.CLIENT,
        attributes={
            "gen_ai.operation.name": GenAiOperationNameValues.CHAT.value,
            "gen_ai.provider.name": "openai",
            "gen_ai.request.model": model,
        },
    ) as span:
        response = client.chat.completions.create(
            model=model, messages=messages
        )
        span.set_attribute("gen_ai.response.model", response.model)
        span.set_attribute("gen_ai.response.id", response.id)
        span.set_attribute(
            "gen_ai.usage.input_tokens", response.usage.prompt_tokens
        )
        span.set_attribute(
            "gen_ai.usage.output_tokens", response.usage.completion_tokens
        )
        span.set_attribute(
            "gen_ai.response.finish_reasons",
            [c.finish_reason for c in response.choices],
        )
        return response
```

### TypeScript / Node.js (OpenAI example)

```typescript
import { trace, SpanKind, SpanStatusCode } from "@opentelemetry/api";

const tracer = trace.getTracer("my-app", "1.0.0");

async function chatCompletion(messages: ChatMessage[], model = "gpt-4") {
  return tracer.startActiveSpan(
    `chat ${model}`,
    { kind: SpanKind.CLIENT,
      attributes: {
        "gen_ai.operation.name": "chat",
        "gen_ai.provider.name": "openai",
        "gen_ai.request.model": model,
      },
    },
    async (span) => {
      try {
        const response = await openai.chat.completions.create({
          model,
          messages,
        });
        span.setAttribute("gen_ai.response.model", response.model);
        span.setAttribute("gen_ai.response.id", response.id);
        span.setAttribute(
          "gen_ai.usage.input_tokens",
          response.usage?.prompt_tokens ?? 0
        );
        span.setAttribute(
          "gen_ai.usage.output_tokens",
          response.usage?.completion_tokens ?? 0
        );
        span.setAttribute(
          "gen_ai.response.finish_reasons",
          response.choices.map((c) => c.finish_reason)
        );
        return response;
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        span.setAttribute("error.type", (err as Error).constructor.name);
        throw err;
      } finally {
        span.end();
      }
    }
  );
}
```

**Auto-instrumentation (TypeScript)** -- use OpenLLMetry's Node SDK:

```typescript
// Must be the very first import in your entry point
import * as Traceloop from "@traceloop/node-server-sdk";

Traceloop.initialize({
  appName: "my-app",
  disableBatch: false, // set true for dev
});
// All OpenAI/Anthropic/etc. client calls now emit gen_ai.* spans
```

### Auto-instrumentation with OpenLLMetry

For most cases, prefer auto-instrumentation over manual spans:

```python
# pip install opentelemetry-instrumentation-openai
from opentelemetry.instrumentation.openai import OpenAIInstrumentor

OpenAIInstrumentor().instrument()
# All openai client calls now emit gen_ai.* spans automatically
```

OpenLLMetry supports: OpenAI, Anthropic, Cohere, Google Generative AI, AWS Bedrock, Azure OpenAI, Hugging Face, LangChain, LlamaIndex, Haystack, ChromaDB, Pinecone, and more.

### Trace structure for an agent pipeline

A typical agentic RAG trace looks like:

```
invoke_agent Supervisor           (INTERNAL span)
  chat gpt-4                      (CLIENT span - planning)
  execute_tool search_docs        (INTERNAL span)
    retrieval pinecone            (CLIENT span - vector search)
  chat gpt-4                      (CLIENT span - synthesis)
```

Each span carries its own `gen_ai.*` attributes. The parent-child relationship shows the flow.

## Error handling

Follow the general OTel error recording conventions:
- Set `error.type` to the provider error code or exception class name
- Set span status to `ERROR` with a description
- Keep `error.type` low-cardinality (use error codes, not messages)

## Key design decisions

**Why `gen_ai.provider.name` matters**: It acts as a discriminator for the telemetry format. An AWS Bedrock span should have `gen_ai.provider.name=aws.bedrock` and use `aws.bedrock.*` attributes, not `openai.*` attributes, even if accessed through an OpenAI-compatible API.

**Sampling attributes**: `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.request.model`, `server.address`, and `server.port` should be set at span creation time because sampling decisions may depend on them.

**Token counting**: Report billable tokens when both used and billable counts are available. If token counts aren't efficiently available, don't force offline counting -- skip the usage metric rather than adding latency.

## Spec links

- [GenAI Spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/)
- [GenAI Events](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-events/)
- [GenAI Metrics](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-metrics/)
- [GenAI Agent Spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/)
- [Provider-specific: OpenAI](https://opentelemetry.io/docs/specs/semconv/gen-ai/openai/)
- [Provider-specific: Anthropic](https://opentelemetry.io/docs/specs/semconv/gen-ai/anthropic/)
- [Provider-specific: AWS Bedrock](https://opentelemetry.io/docs/specs/semconv/gen-ai/aws-bedrock/)
- [Provider-specific: Azure AI Inference](https://opentelemetry.io/docs/specs/semconv/gen-ai/azure-ai-inference/)
- [MCP Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/)
