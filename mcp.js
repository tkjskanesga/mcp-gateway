import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import pc from "picocolors";
import OpenAI from "openai";
import dotenv from "dotenv";
import { intro, outro, text, log, isCancel, spinner, note } from "@clack/prompts";

dotenv.config({ path: ".env", quiet: true });

const serverMCPSse = (process.argv.includes("--mcp") ? process.argv[process.argv.indexOf("--mcp") + 1] : undefined) || process.env.MCP_SERVER_URL;
const modelUsage = (process.argv.includes("--model") ? process.argv[process.argv.indexOf("--model") + 1] : undefined) || process.env.OPENAI_MODEL || "gpt-4o";
const apiKeyModel = (process.argv.includes("--apikey") ? process.argv[process.argv.indexOf("--apikey") + 1] : undefined) || process.env.OPENAI_API_KEY || "";
const providerAPI = (process.argv.includes("--provider") ? process.argv[process.argv.indexOf("--provider") + 1] : undefined) || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

const client = new OpenAI({
  apiKey: apiKeyModel,
  baseURL: providerAPI,
});

let historyChat = [];
let tools = [];
let mcpread = null;

async function ReadingMCPAndConnect() {
  console.clear();

  intro(`${pc.bgCyan(pc.black(" MCP GATEWAY "))} ${pc.cyan("Connect Models to MCP Servers")}`);

  note(
    `${pc.dim("Model:")} ${pc.green(modelUsage)}\n` +
    `${pc.dim("MCP:")}   ${pc.blue(serverMCPSse || "Not provided")}\n` +
    `${pc.dim("API:")}   ${pc.yellow(providerAPI)}`,
    "System Configuration"
  );

  // Validate MCP List
  if (!serverMCPSse) {
    outro(`${pc.red("Error: MCP server URL is required. Use --mcp <url> or set MCP_SERVER_URL in .env")}`);
    process.exit(1);
  }

  if (!(String(serverMCPSse).startsWith("http://") || String(serverMCPSse).startsWith("https://"))) {
    outro(`${pc.red("Error: MCP server URL is invalid. It must start with http:// or https://")}`);
    process.exit(1);
  }

  const s = spinner();
  s.start(`${pc.cyan("Connecting to MCP server...")}`);

  try {
    const transport = new StreamableHTTPClientTransport(serverMCPSse);
    const mcpclient = new Client({
      name: "MCP Gateway CLI",
      version: "1.1.0"
    }, {
      capabilities: {}
    });

    await mcpclient.connect(transport);
    mcpread = mcpclient;

    const listTools = await mcpclient.listTools();
    tools = listTools.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }));

    s.stop(`${pc.green("Connected successfully!")} ${pc.dim(`(${tools.length} tools available)`)}`);

    ConversationInput();
  } catch (error) {
    s.stop(`${pc.red("Connection failed")}`);
    log.error(pc.red(`Failed to connect to MCP server: ${error.message}`));
    outro(pc.red("Exiting..."));
    process.exit(1);
  }
}

async function ConversationInput() {
  const prompt = await text({
    message: `${pc.magenta("You")}`,
    placeholder: "Type your message here...",
    validate(value) {
      if (value.trim().length === 0) return `Please enter a message!`;
    },
  });

  if (isCancel(prompt)) {
    outro(`${pc.yellow("Goodbye!")}`);
    process.exit(0);
  }

  historyChat.push({
    role: "user",
    content: prompt
  });

  await ProcessAI();
}

async function ProcessAI() {
  const s = spinner();
  s.start(`${pc.cyan("AI is thinking...")}`);

  try {
    const response = await client.chat.completions.create({
      model: modelUsage,
      messages: historyChat,
      tools: tools.length > 0 ? tools : undefined,
      stream: true,
    });

    let fullContent = "";
    let toolCalls = [];
    let isFirstChunk = true;
    let needsBorder = true;

    for await (const chunk of response) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        if (isFirstChunk) {
          s.stop(`${pc.green("AI Response:")}`);
          isFirstChunk = false;
        }

        for (const char of delta.content) {
          if (needsBorder && char !== "\n") {
            process.stdout.write(pc.white("│  "));
            needsBorder = false;
          }
          process.stdout.write(char);
          if (char === "\n") {
            needsBorder = true;
          }
        }
        fullContent += delta.content;
      }

      if (delta?.tool_calls) {
        for (const toolCallDelta of delta.tool_calls) {
          const index = toolCallDelta.index;
          if (!toolCalls[index]) {
            toolCalls[index] = {
              id: toolCallDelta.id,
              type: "function",
              function: { name: "", arguments: "" }
            };
          }
          if (toolCallDelta.function?.name) {
            toolCalls[index].function.name += toolCallDelta.function.name;
          }
          if (toolCallDelta.function?.arguments) {
            toolCalls[index].function.arguments += toolCallDelta.function.arguments;
          }
        }
      }
    }

    if (!isFirstChunk) {
      process.stdout.write("\n");
    }

    if (fullContent) {
      historyChat.push({
        role: "assistant",
        content: fullContent
      });
    }

    if (toolCalls.length > 0) {
      if (isFirstChunk) {
        s.stop(`${pc.cyan("AI calling tools...")}`);
      }

      const assistantMessage = {
        role: "assistant",
        tool_calls: toolCalls.map(tc => ({
          id: tc.id,
          type: "function",
          function: tc.function
        }))
      };
      historyChat.push(assistantMessage);

      for (const tool of toolCalls) {
        const toolName = tool.function.name;
        const toolArgs = tool.function.arguments;

        log.step(`${pc.yellow("Tool Call:")} ${pc.white(toolName)}`);

        try {
          const args = JSON.parse(toolArgs || "{}");
          const result = await mcpread.callTool({
            name: toolName,
            arguments: args
          });

          log.step(`${pc.green("Tool Result:")} ${pc.white(toolName)} ${pc.dim("success")}`);

          historyChat.push({
            role: "tool",
            tool_call_id: tool.id,
            name: toolName,
            content: JSON.stringify(result)
          });
        } catch (error) {
          log.error(`${pc.red("Tool Error:")} ${pc.white(toolName)} - ${error.message}`);
          historyChat.push({
            role: "tool",
            tool_call_id: tool.id,
            name: toolName,
            content: JSON.stringify({ error: error.message })
          });
        }
      }

      // Re-process with tool results
      return await ProcessAI();
    }

    await ConversationInput();
  } catch (error) {
    s.stop(`${pc.red("Error occurred")}`);

    if (error.message.includes("413") || error.message.includes("context_length_exceeded")) {
      log.warn(pc.yellow("Context limit reached. Clearing history and retrying..."));
      // Keep only the last message (user prompt)
      historyChat = historyChat.slice(-1);
      return await ProcessAI();
    }

    log.error(`${pc.red("AI Error:")} ${error.message}`);

    const retry = await text({
      message: "Press Enter to continue or type 'exit' to quit",
    });

    if (retry === "exit" || isCancel(retry)) {
      outro(pc.yellow("Goodbye!"));
      process.exit(1);
    }

    await ConversationInput();
  }
}

ReadingMCPAndConnect();
