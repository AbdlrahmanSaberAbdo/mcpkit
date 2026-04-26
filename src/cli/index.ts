import { Command } from "commander";
import { registerProxyCommand } from "./proxy.js";
import { registerInspectCommand } from "./inspect.js";
import { registerInitCommand } from "./init.js";
import { registerServeCommand } from "./serve.js";

export function createCli(): Command {
  const program = new Command();

  program
    .name("mcpkit")
    .description("MCP Developer Toolkit — scaffold, proxy, and inspect MCP servers")
    .version("0.1.0");

  registerProxyCommand(program);
  registerInspectCommand(program);
  registerInitCommand(program);
  registerServeCommand(program);

  return program;
}
