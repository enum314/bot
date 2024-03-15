import { deepStrictEqual } from "assert";
import yaml from "yaml";
import type { z } from "zod";

import { existsFile, readFile, writeFile } from "../exports/file-system.js";
import Logger from "../utils/logger.js";
import { merge } from "../utils/merge.js";

export class Configuration<ConfigurationStructure> {
  private defaults!: ConfigurationStructure;
  private cache!: ConfigurationStructure;
  private validation!: z.ZodObject<
    any,
    "strict",
    z.ZodTypeAny,
    ConfigurationStructure,
    ConfigurationStructure
  >;

  public constructor(
    public pluginName: string,
    public name: string
  ) {}

  public getValidation() {
    return this.validation;
  }

  public setValidation(
    validation: z.ZodObject<
      any,
      "strict",
      z.ZodTypeAny,
      ConfigurationStructure,
      ConfigurationStructure
    >
  ) {
    this.validation = validation;

    return this;
  }

  public setDefaults(data: ConfigurationStructure) {
    this.defaults = data;

    return this;
  }

  public async load() {
    const data = await this._load();

    if (!data) return;

    this.cache = data;
  }

  public async reload() {
    await this.load();
  }

  public async read() {
    if (!this.cache) {
      await this.load();
    }

    return this.cache;
  }

  public async edit(partial: Partial<ConfigurationStructure>) {
    const response = this.validation.safeParse(partial);

    if (!response.success) {
      return { data: null, error: response.error };
    }

    const current = this.read();

    const data = merge(
      merge(this.defaults, current),
      partial
    ) as ConfigurationStructure;

    await writeFile(
      ["plugins", this.pluginName, `${this.name}.yml`],
      yaml.stringify(data)
    );

    this.cache = data;

    return { data, error: null };
  }

  private async _load() {
    if (await existsFile(["plugins", this.pluginName, `${this.name}.yml`])) {
      try {
        const buffer = await readFile([
          "plugins",
          this.pluginName,
          `${this.name}.yml`,
        ]);

        const data = yaml.parse(buffer.toString());

        const response = this.validation.safeParse(
          merge(this.defaults, data, { clone: true })
        );

        if (!response.success) {
          throw response.error;
        }

        try {
          deepStrictEqual(response.data, data);
        } catch (err) {
          await this.edit(response.data);
        }

        return response.data;
      } catch (err) {
        Logger.error(
          `[Config (${this.name}.yml)] Error loading config file`
        ).error(err);
      }

      return null;
    }

    await writeFile(
      ["plugins", this.pluginName, `${this.name}.yml`],
      yaml.stringify(this.defaults)
    );

    return this.defaults;
  }
}
