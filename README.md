# MCP Gateway

## About

MCP Gateway is a CLI tool designed to connect AI models (OpenAI-compatible) to Model Context Protocol (MCP) servers. It allows you to interact with MCP tools through a conversational interface with support for streaming responses and automated tool execution.

## Usage

### Installation

Ensure you have Bun installed, then install the dependencies:
```bash
bun install
```

### Running the CLI

You can run the gateway using the following command:
```bash
bun mcp.js --mcp <MCP_SERVER_URL>
```

### Options

The CLI supports several arguments to configure the connection:
- `--mcp`: URL of the MCP server (required).
- `--model`: Name of the model to use (default: gpt-4o).
- `--apikey`: API key for the model provider (default: ollama).
- `--provider`: Base URL for the model provider API.

### Environment Variables

Alternatively, you can configure the tool using a `.env` file:
- `MCP_SERVER_URL`: Default MCP server URL.
- `OPENAI_MODEL`: Default model name.
- `OPENAI_API_KEY`: API key for the model provider.
- `OPENAI_BASE_URL`: Base URL for the model provider API.
