import child_process from "child_process";
import process from "process";
import fs from "fs";
import path from "path";
import { refreshEnv } from "./envHelper.mts";

// Constants
const PROGRAM_FILES_X86 = process.env["ProgramFiles(x86)"] || "";
const PROGRAM_FILES = [
  process.env["ProgramFiles(x86)"],
  process.env["ProgramFiles"],
].filter(Boolean) as string[];

const VS_EDITIONS = ["Enterprise", "Professional", "Community", "BuildTools"] as const;
const SUPPORTED_YEARS = ["2022", "2019", "2017"] as const;

const VS_YEAR_TO_VERSION: Record<string, string> = {
  "2022": "17.0",
  "2019": "16.0",
  "2017": "15.0",
  "2015": "14.0",
  "2013": "12.0",
};

const VSWHERE_PATH = path.join(PROGRAM_FILES_X86, "Microsoft Visual Studio", "Installer");

// Type aliases for better type safety
type Architecture = "x86" | "x64" | "arm" | "arm64";

// Architecture aliases mapping (case-insensitive)
const ARCHITECTURE_ALIASES: Record<string, Architecture> = {
  win32: "x86",
  win64: "x64",
  x86_64: "x64",
  "x86-64": "x64",
};

/**
 * Converts Visual Studio version to version number
 */
function normalizeVsVersion(version: string): string {
  if (Object.values(VS_YEAR_TO_VERSION).includes(version)) {
    return version;
  }
  return VS_YEAR_TO_VERSION[version] || version;
}

/**
 * Converts Visual Studio version to release year
 */
function versionToYear(version: string): string {
  if (version in VS_YEAR_TO_VERSION) {
    return version;
  }

  for (const [year, ver] of Object.entries(VS_YEAR_TO_VERSION)) {
    if (ver === version) {
      return year;
    }
  }

  return version;
}

/**
 * Finds Visual Studio component using vswhere.exe
 */
function findWithVswhere(pattern: string, versionPattern?: string): string | null {
  try {
    const versionArg = versionPattern ? ` ${versionPattern}` : "";
    const command = `vswhere -products *${versionArg} -prerelease -property installationPath`;

    const installationPath = child_process
      .execSync(command)
      .toString()
      .trim();

    if (installationPath) {
      const fullPath = path.join(installationPath, pattern);
      if (fs.existsSync(fullPath)) {
        console.info(`Found with vswhere: ${fullPath}`);
        return fullPath;
      }
    }
  } catch (error) {
    console.warn(`vswhere failed: ${error}`);
  }

  return null;
}

/**
 * Locates vcvarsall.bat file
 */
function findVcvarsall(vsVersion?: string, vsPath?: string): string {
  const vsVersionNumber = vsVersion ? normalizeVsVersion(vsVersion) : undefined;
  let versionPattern = "";

  if (vsVersionNumber) {
    const upperBound = `${vsVersionNumber.split(".")[0]}.9`;
    versionPattern = `-version "${vsVersionNumber},${upperBound}"`;
  } else {
    versionPattern = "-latest";
  }

  // Check user-specified custom path first
  if (vsPath) {
    const customPath = path.join(vsPath, "VC", "Auxiliary", "Build", "vcvarsall.bat");
    console.info(`Checking custom location: ${customPath}`);

    if (fs.existsSync(customPath)) {
      console.info(`Found at custom location: ${customPath}`);
      return customPath;
    } else {
      console.warn(`Custom path does not exist: ${customPath}`);
    }
  } else {
    console.info("User does not specify the path, checking with vswhere...");
  }

  // if user not specify the path, try to find with vswhere
  const vswherePath = findWithVswhere(
    path.join("VC", "Auxiliary", "Build", "vcvarsall.bat"),
    versionPattern
  );

  if (vswherePath) {
    return vswherePath;
  }
  console.info("Not found with vswhere, checking standard locations...");

  // Check standard installation locations
  const years = vsVersion ? [versionToYear(vsVersion)] : [...SUPPORTED_YEARS];

  for (const programFiles of PROGRAM_FILES) {
    for (const year of years) {
      for (const edition of VS_EDITIONS) {
        const testPath = path.join(
          programFiles,
          "Microsoft Visual Studio",
          year,
          edition,
          "VC",
          "Auxiliary",
          "Build",
          "vcvarsall.bat"
        );

        console.info(`Checking: ${testPath}`);

        if (fs.existsSync(testPath)) {
          console.info(`Found at standard location: ${testPath}`);
          return testPath;
        }
      }
    }
  }

  // Special case for Visual Studio 2015
  const vs2015Path = path.join(
    PROGRAM_FILES_X86,
    "Microsoft Visual C++ Build Tools",
    "vcbuildtools.bat"
  );

  if (fs.existsSync(vs2015Path)) {
    console.info(`Found VS 2015 tools: ${vs2015Path}`);
    return vs2015Path;
  }

  throw new Error("Microsoft Visual Studio not found");
}

interface MSVCDevCmdOptions {
  arch: string;
  vsPath?: string;
  sdk?: string;
  toolset?: string;
  uwp?: boolean;
  spectre?: boolean;
  vsVersion?: string;
}

/**
 * Configures MSVC Developer Command Prompt environment
 */
export function setupMSVCDevCmd(options: MSVCDevCmdOptions): void {
  if (process.platform !== "win32") {
    console.info("This is not a Windows environment, skipping MSVC setup");
    return;
  }

  // Add vswhere to PATH if not already present
  if (!process.env.PATH?.includes(VSWHERE_PATH)) {
    process.env.PATH += `${path.delimiter}${VSWHERE_PATH}`;
  }

  // Normalize architecture
  let normalizedArch = options.arch;
  const lowerArch = options.arch.toLowerCase();
  if (lowerArch in ARCHITECTURE_ALIASES) {
    normalizedArch = ARCHITECTURE_ALIASES[lowerArch];
  }

  // Prepare vcvarsall arguments
  const args: string[] = [normalizedArch];

  if (options.uwp) {
    args.push("uwp");
  }

  if (options.sdk) {
    args.push(options.sdk);
  }

  if (options.toolset) {
    args.push(`-vcvars_ver=${options.toolset}`);
  }

  if (options.spectre) {
    args.push("-vcvars_spectre_libs=spectre");
  }

  const vcvarsPath = findVcvarsall(options.vsVersion, options.vsPath);
  const vcvarsCommand = `"${vcvarsPath}" ${args.join(" ")}`;

  console.debug(`Executing vcvars command: ${vcvarsCommand}`);

  try {
    refreshEnv(vcvarsCommand, /^\[ERROR.*\]/);
    console.info("Successfully configured Developer Command Prompt");
  } catch (error) {
    console.error("Failed to configure Developer Command Prompt:", error);
    throw error;
  }
}
