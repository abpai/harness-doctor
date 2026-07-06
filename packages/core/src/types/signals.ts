export interface PackageScriptSignal {
  readonly workspace: string | null;
  readonly name: string;
  readonly command: string;
}

export interface CiCommandSignal {
  readonly workflow: string;
  readonly job: string;
  readonly commands: string[];
}

export interface SignalsMenu {
  readonly packageScripts: PackageScriptSignal[];
  readonly ciCommands: CiCommandSignal[];
  readonly makeTargets: string[];
  readonly justRecipes: string[];
}
