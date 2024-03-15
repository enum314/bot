import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

import type { Plugin } from './Plugin.js';

export class Command {
	public data!: any;

	private _handler!: (
		interaction: ChatInputCommandInteraction<'cached'>,
	) => Promise<any> | any;

	public constructor(
		public readonly plugin: Plugin,
		builder: SlashCommandBuilder,
	) {
		this.data = builder.toJSON();
	}

	public get name() {
		return this.data.name;
	}

	public get description() {
		return this.data.description;
	}

	public get handler() {
		return this._handler;
	}

	public dispatch(
		fn: (
			interaction: ChatInputCommandInteraction<'cached'>,
		) => Promise<any> | any,
	) {
		this._handler = fn;

		return this;
	}
}
