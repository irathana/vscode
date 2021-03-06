/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput, ITextEditorModel, IModeSupport, GroupIdentifier, isTextEditor } from 'vs/workbench/common/editor';
import { URI } from 'vs/base/common/uri';
import { IReference } from 'vs/base/common/lifecycle';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ResourceEditorModel } from 'vs/workbench/common/editor/resourceEditorModel';
import { basename } from 'vs/base/common/resources';
import { ITextFileSaveOptions, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import type { IEditorViewState } from 'vs/editor/common/editorCommon';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

/**
 * A read-only text editor input whos contents are made of the provided resource that points to an existing
 * code editor model.
 */
export class ResourceEditorInput extends EditorInput implements IModeSupport {

	static readonly ID: string = 'workbench.editors.resourceEditorInput';

	private cachedModel: ResourceEditorModel | null = null;
	private modelReference: Promise<IReference<ITextEditorModel>> | null = null;

	constructor(
		private name: string | undefined,
		private description: string | undefined,
		private readonly resource: URI,
		private preferredMode: string | undefined,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IEditorService private readonly editorService: IEditorService
	) {
		super();

		this.name = name;
		this.description = description;
		this.resource = resource;
	}

	getResource(): URI {
		return this.resource;
	}

	getTypeId(): string {
		return ResourceEditorInput.ID;
	}

	getName(): string {
		return this.name || basename(this.resource);
	}

	setName(name: string): void {
		if (this.name !== name) {
			this.name = name;
			this._onDidChangeLabel.fire();
		}
	}

	getDescription(): string | undefined {
		return this.description;
	}

	setDescription(description: string): void {
		if (this.description !== description) {
			this.description = description;
			this._onDidChangeLabel.fire();
		}
	}

	setMode(mode: string): void {
		this.setPreferredMode(mode);

		if (this.cachedModel) {
			this.cachedModel.setMode(mode);
		}
	}

	setPreferredMode(mode: string): void {
		this.preferredMode = mode;
	}

	async resolve(): Promise<ITextEditorModel> {
		if (!this.modelReference) {
			this.modelReference = this.textModelResolverService.createModelReference(this.resource);
		}

		const ref = await this.modelReference;

		const model = ref.object;

		// Ensure the resolved model is of expected type
		if (!(model instanceof ResourceEditorModel)) {
			ref.dispose();
			this.modelReference = null;

			throw new Error(`Unexpected model for ResourceInput: ${this.resource}`);
		}

		this.cachedModel = model;

		// Set mode if we have a preferred mode configured
		if (this.preferredMode) {
			model.setMode(this.preferredMode);
		}

		return model;
	}

	async saveAs(group: GroupIdentifier, options?: ITextFileSaveOptions): Promise<boolean> {

		// Preserve view state by opening the editor first. In addition
		// this allows the user to review the contents of the editor.
		let viewState: IEditorViewState | undefined = undefined;
		const editor = await this.editorService.openEditor(this, undefined, group);
		if (isTextEditor(editor)) {
			viewState = editor.getViewState();
		}

		// Save as
		const target = await this.textFileService.saveAs(this.resource, undefined, options);
		if (!target) {
			return false; // save cancelled
		}

		// Open the target
		await this.editorService.openEditor({ resource: target, options: { viewState, pinned: true } }, group);

		return true;
	}

	matches(otherInput: unknown): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		// Compare by properties
		if (otherInput instanceof ResourceEditorInput) {
			return otherInput.resource.toString() === this.resource.toString();
		}

		return false;
	}

	dispose(): void {
		if (this.modelReference) {
			this.modelReference.then(ref => ref.dispose());
			this.modelReference = null;
		}

		this.cachedModel = null;

		super.dispose();
	}
}
