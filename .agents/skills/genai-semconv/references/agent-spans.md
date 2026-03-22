# GenAI Agent Span Conventions

## Table of contents

1. [Create agent span](#create-agent-span)
2. [Invoke agent span](#invoke-agent-span)
3. [Execute tool span](#execute-tool-span)
4. [Agent trace structure examples](#agent-trace-structure-examples)

---

## Create agent span

Describes agent creation, typically for remote agent services (e.g., OpenAI Assistants, AWS Bedrock Agents).

- **`gen_ai.operation.name`**: `create_agent`
- **Span name**: `create_agent {gen_ai.agent.name}`
- **Span kind**: `CLIENT`

### Agent-specific attributes

| Attribute                 | Type   | Requirement          | Example                           |
| ------------------------- | ------ | -------------------- | --------------------------------- |
| `gen_ai.agent.id`         | string | Conditionally required | `asst_5j66UpCpwteGg4YSxUnt7lPY` |
| `gen_ai.agent.name`       | string | Conditionally required | `Math Tutor`                     |
| `gen_ai.agent.description`| string | Conditionally required | `Helps with math problems`       |
| `gen_ai.agent.version`    | string | Conditionally required | `1.0.0`                          |

Plus all standard inference span attributes (`gen_ai.provider.name`, `gen_ai.request.model`, `server.address`, etc.).

---

## Invoke agent span

Describes agent invocation -- the main span for an agent handling a user request.

- **`gen_ai.operation.name`**: `invoke_agent`
- **Span name**: `invoke_agent {gen_ai.agent.name}` (or just `invoke_agent` if name unavailable)
- **Span kind**: `CLIENT` for remote agents, `INTERNAL` for in-process agents

### When to use CLIENT vs INTERNAL

| Scenario                                     | Span kind  |
| -------------------------------------------- | ---------- |
| Remote agent services (OpenAI Assistants, AWS Bedrock Agents) | `CLIENT`   |
| In-process agents (LangChain, CrewAI, custom) | `INTERNAL` |

### Additional attributes for invoke_agent

All attributes from inference spans apply, plus:

| Attribute                 | Type   | Requirement          | Example                           |
| ------------------------- | ------ | -------------------- | --------------------------------- |
| `gen_ai.agent.id`         | string | Conditionally required | `asst_5j66UpCpwteGg4YSxUnt7lPY` |
| `gen_ai.agent.name`       | string | Conditionally required | `Supervisor`                     |
| `gen_ai.agent.description`| string | Conditionally required | `Orchestrates agents for flights` |
| `gen_ai.agent.version`    | string | Conditionally required | `2025-05-01`                     |
| `gen_ai.data_source.id`   | string | Conditionally required | `H7STPQYOND`                     |

The `gen_ai.data_source.id` identifies a knowledge base or data source used for RAG within the agent.

The invoke agent span also supports all opt-in content attributes:
- `gen_ai.system_instructions`
- `gen_ai.input.messages`
- `gen_ai.output.messages`
- `gen_ai.tool.definitions`

---

## Execute tool span

Represents a tool call made by the model during an agent loop.

- **`gen_ai.operation.name`**: `execute_tool`
- **Span name**: `execute_tool {gen_ai.tool.name}`
- **Span kind**: `INTERNAL`

### Attributes

| Attribute                | Type   | Requirement            | Example             |
| ------------------------ | ------ | ---------------------- | ------------------- |
| `gen_ai.operation.name`  | string | Required               | `execute_tool`      |
| `gen_ai.provider.name`   | string | Required               | `openai`            |
| `gen_ai.tool.name`       | string | Conditionally required | `get_weather`       |
| `gen_ai.tool.call.id`    | string | Conditionally required | `call_abc123`       |
| `error.type`             | string | If tool execution failed | `ValueError`      |

---

## Agent trace structure examples

### Simple agent with tool use

```
invoke_agent FAQ Agent                    (INTERNAL, gen_ai.operation.name=invoke_agent)
  chat gpt-4                              (CLIENT, gen_ai.operation.name=chat)
  execute_tool search_knowledge_base      (INTERNAL, gen_ai.operation.name=execute_tool)
    retrieval pinecone                    (CLIENT, gen_ai.operation.name=retrieval)
  chat gpt-4                              (CLIENT, gen_ai.operation.name=chat)
```

### Multi-agent orchestration

```
invoke_agent Supervisor                   (INTERNAL)
  chat gpt-4                              (CLIENT - routing decision)
  invoke_agent Flight Booking Agent       (INTERNAL)
    chat gpt-4                            (CLIENT)
    execute_tool book_flight              (INTERNAL)
  invoke_agent Hotel Agent                (INTERNAL)
    chat gpt-4                            (CLIENT)
    execute_tool search_hotels            (INTERNAL)
  chat gpt-4                              (CLIENT - final synthesis)
```

### Remote agent service (e.g., AWS Bedrock Agent)

```
invoke_agent TravelAssistant              (CLIENT, gen_ai.provider.name=aws.bedrock)
  // Child spans may be created by the service's instrumentation
  // or may not be visible from the client side
```

### RAG pipeline

```
chat gpt-4                                (CLIENT)
  // No child spans -- simple LLM call

// Or with explicit retrieval:
invoke_agent RAG Assistant                (INTERNAL)
  retrieval text-embedding-3-small        (CLIENT - semantic search)
  chat gpt-4                              (CLIENT - generation with context)
```
