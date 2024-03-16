import { Client, Collection } from "discord.js";
import semver from "semver";

import { existsDirectory, mkdir, readdir } from "../exports/file-system.js";
import type { Context } from "../types/types.js";
import { Configuration } from "./configuration.js";
import { Graph } from "./graph.js";
import { Plugin } from "./plugin.js";

export class PluginManager {
  private init = false;
  private graph = new Graph();
  private plugins = new Collection<string, Plugin>();

  public constructor(private client: Client<true>) {}

  public get(pluginName: string): Plugin | undefined {
    return this.plugins.get(pluginName);
  }

  public has(pluginName: string) {
    return this.plugins.some((plugin) => plugin.name === pluginName);
  }

  public get size() {
    return this.plugins.size;
  }

  public getPlugins(): Plugin[] {
    return this.graph
      .topologicalSort()
      .map((x) => this.get(x))
      .filter((plugin) => plugin) as Plugin[];
  }

  public async initialize() {
    if (this.init) {
      throw new Error(`PluginManager has already been initialized.`);
    }

    this.init = true;

    const files = (await readdir(["plugins"])).filter((e) => e.endsWith(".js"));

    for (const file of files) {
      try {
        const pluginFile = await import(`#plugins/${file.split(".")[0]}`);

        if (
          typeof pluginFile.default === "object" &&
          pluginFile.default instanceof Plugin
        ) {
          const plugin = pluginFile.default;

          this.plugins.set(plugin.name, plugin);
        }
      } catch (err) {
        this.client.logger
          .error(
            `[PluginManager] error importing '${file.split(".")[0]}' plugin.`
          )
          .error(err);
      }
    }

    this.client.logger.info(
      `[PluginManager] Loading ${this.size} plugin${
        this.size > 1 ? "s" : ""
      }...`
    );

    for (const [, plugin] of this.plugins) {
      this.graph.addNode(plugin.name);

      if (Object.keys(plugin.dependencies).length) {
        for (const [dependency] of Object.entries(plugin.dependencies)) {
          this.graph.addEdge(plugin.name, dependency.split("/")[1]);
        }
      }

      if (Object.keys(plugin.optionalDependencies).length) {
        for (const [dependency] of Object.entries(
          plugin.optionalDependencies
        )) {
          if (this.has(dependency.split("/")[1])) {
            this.graph.addEdge(plugin.name, dependency.split("/")[1]);
          }
        }
      }
    }

    for (const plugin of this.getPlugins()) {
      this.client.logger.info(`[PluginManager] - ${plugin.name}`);

      try {
        const errors: string[] = [];

        if (Object.keys(plugin.dependencies).length) {
          for (const [name, version] of Object.entries(plugin.dependencies)) {
            const [temp, pluginName] = name.split("/");
            const p = this.get(pluginName);
            const author = temp.slice(1);

            if (!p) {
              errors.push(
                `'${plugin.name}' plugin depends on '${name}' plugin. '${name}' plugin is not installed or the plugin failed to load.`
              );
            }

            if (p && !semver.satisfies(p.version, version)) {
              errors.push(
                `'${plugin.name}' plugin depends on '${name}' plugin version ${version}. Installed version is ${p.version}.`
              );
            }

            if (p && p.author !== author) {
              errors.push(
                `'${plugin.name}' plugin depends on '${name}' plugin. Author mismatch. Expected '${author}' but got '${p.author}'.`
              );
            }
          }
        }

        if (Object.keys(plugin.optionalDependencies).length) {
          for (const [name, version] of Object.entries(
            plugin.optionalDependencies
          )) {
            const [temp, pluginName] = name.split("/");
            const p = this.get(pluginName);
            const author = temp.slice(1);

            if (p && !semver.satisfies(p.version, version)) {
              errors.push(
                `'${plugin.name}' plugin depends on '${name}' plugin version ${version}. Installed version is ${p.version}.`
              );
            }

            if (p && p.author !== author) {
              errors.push(
                `'${plugin.name}' plugin depends on '${name}' plugin. Author mismatch. Expected '${author}' but got '${p.author}'.`
              );
            }
          }
        }

        if (errors.length) {
          throw `- ${plugin.name}\n\t- ${errors.join("\n\t- ")}`;
        }

        const pluginFolder = ["plugins", plugin.name];

        if (!(await existsDirectory(pluginFolder))) {
          mkdir(pluginFolder);
        }

        const context: Context<any> = {
          client: this.client,
          logger: {
            info: (message) =>
              this.client.logger.info(`[${plugin.name}] ${message}`),
            error: (message) =>
              this.client.logger.error(`[${plugin.name}] ${message}`),
            warn: (message) =>
              this.client.logger.warn(`[${plugin.name}] ${message}`),
          },
          configs: {},
        };

        for (const configName in plugin.configs) {
          const config = new Configuration(plugin.name, configName);

          config.setValidation(plugin.configs[configName]);
          config.setDefaults(plugin.configs[configName].parse({}));

          await config.load();

          context.configs[configName] = config;
        }

        plugin.setContext(context);
      } catch (err) {
        this.client.logger
          .error(`[PluginManager] Error loading ${plugin.name} plugin.`)
          .error(err);

        this.plugins.delete(plugin.name);
        this.graph.removeNode(plugin.name);
      }
    }

    let eventCount = 0;

    for (const plugin of this.getPlugins()) {
      await plugin.setupFn(
        plugin.getContext(),
        Object.fromEntries(
          Object.entries(plugin.dependencies).map(([x]) => {
            const [, pluginName] = x.split("/");
            const p = this.get(pluginName);

            return [pluginName, p?.api];
          })
        ),
        Object.fromEntries(
          Object.entries(plugin.optionalDependencies).map(([x]) => {
            const [, pluginName] = x.split("/");
            const p = this.get(pluginName);

            return [pluginName, p?.api];
          })
        )
      );

      for (const command of plugin.commands) {
        const ex = this.client.commands.get(command.name);

        if (ex) {
          this.client.logger.warn(
            `[PluginManager] Command '${ex.name}' from '${ex.plugin.name}' plugin will be overriden by '${plugin.name}' plugin`
          );
        }

        this.client.commands.set(command.name, command);
      }

      for (const { eventName, execution, listener } of plugin.events) {
        if (execution === "on") {
          this.client.on(eventName, (...args) => {
            listener(...args);
          });
        }

        if (execution === "once") {
          this.client.once(eventName, (...args) => {
            listener(...args);
          });
        }

        eventCount++;
      }

      for (const inhibitor of plugin.inhibitors) {
        this.client.dispatcher.inhibitors.push(inhibitor);
      }
    }

    this.client.logger.info(
      `[PluginManager] Loaded ${this.client.plugins.size} plugin${
        this.client.plugins.size > 1 ? "s" : ""
      }`
    );

    this.client.logger.info(
      `[PluginManager] - ${this.client.commands.size} Command${
        this.client.commands.size > 1 ? "s" : ""
      }`
    );
    this.client.logger.info(
      `[PluginManager] - ${eventCount} Event${eventCount > 1 ? "s" : ""}`
    );

    this.client.logger.info(
      `[PluginManager] - ${this.client.dispatcher.inhibitors.length} Inhibitor${
        this.client.dispatcher.inhibitors.length > 1 ? "s" : ""
      }`
    );
  }
}
