import child_process from "child_process";
import process from "process";
import { refreshEnv } from "./envHelper.mts";

const PROGRAM_FILES_X86 = process.env["ProgramFiles(x86)"];
const PROGRAM_FILES = [
  process.env["ProgramFiles(x86)"],
  process.env["ProgramFiles"],
];

const EDITIONS = ["Enterprise", "Professional", "Community", "BuildTools"];
const YEARS = ["2022", "2019", "2017"];

const VsYearVersion = {
  "2022": "17.0",
  "2019": "16.0",
  "2017": "15.0",
  "2015": "14.0",
  "2013": "12.0",
};

function vsversion_to_versionnumber(vsversion) {
  if (Object.values(VsYearVersion).includes(vsversion)) {
    return vsversion;
  } else {
    if (vsversion in VsYearVersion) {
      return VsYearVersion[vsversion];
    }
  }
  return vsversion;
}

function vsversion_to_year(vsversion) {
  if (Object.keys(VsYearVersion).includes(vsversion)) {
    return vsversion;
  } else {
    for (const [year, ver] of Object.entries(VsYearVersion)) {
      if (ver === vsversion) {
        return year;
      }
    }
  }
  return vsversion;
}

const VSWHERE_PATH = `${PROGRAM_FILES_X86}\\Microsoft Visual Studio\\Installer`;

function findWithVswhere(pattern, version_pattern) {
  try {
    let installationPath = child_process
      .execSync(
        `vswhere -products * ${version_pattern} -prerelease -property installationPath`
      )
      .toString()
      .trim();
    return installationPath + "\\" + pattern;
  } catch (e) {
    console.warn(`vswhere failed: ${e}`);
  }
  return null;
}

export function findVcvarsall(vsversion, vspath) {
  const vsversion_number = vsversion_to_versionnumber(vsversion);
  let version_pattern;
  if (vsversion_number) {
    const upper_bound = vsversion_number.split(".")[0] + ".9";
    version_pattern = `-version "${vsversion_number},${upper_bound}"`;
  } else {
    version_pattern = "-latest";
  }

  // If vswhere is available, ask it about the location of the latest Visual Studio.
  let path = findWithVswhere(
    "VC\\Auxiliary\\Build\\vcvarsall.bat",
    version_pattern
  );
  if (path && fs.existsSync(path)) {
    console.info(`Found with vswhere: ${path}`);
    return path;
  }
  console.info("Not found with vswhere");

  // If that does not work, try the standard installation locations,
  // starting with the latest and moving to the oldest.
  const years = vsversion ? [vsversion_to_year(vsversion)] : YEARS;
  for (const prog_files of PROGRAM_FILES) {
    for (const ver of years) {
      for (const ed of EDITIONS) {
        path = `${prog_files}\\Microsoft Visual Studio\\${ver}\\${ed}\\VC\\Auxiliary\\Build\\vcvarsall.bat`;
        console.info(`Trying standard location: ${path}`);
        if (fs.existsSync(path)) {
          console.info(`Found standard location: ${path}`);
          return path;
        }
      }
    }
  }
  // Find user specified custom path
  if (vspath) {
    path = `${vspath}\\VC\\Auxiliary\\Build\\vcvarsall.bat`;
    console.info(`Trying user specified location: ${path}`);
    if (fs.existsSync(path)) {
      console.info(`Found use specified location: ${path}`);
      return path;
    }
  }

  console.info("Not found in standard locations");

  // Special case for Visual Studio 2015 (and maybe earlier), try it out too.
  path = `${PROGRAM_FILES_X86}\\Microsoft Visual C++ Build Tools\\vcbuildtools.bat`;
  if (fs.existsSync(path)) {
    console.info(`Found VS 2015: ${path}`);
    return path;
  }
  console.info(`Not found in VS 2015 location: ${path}`);

  throw new Error("Microsoft Visual Studio not found");
}

/** See https://github.com/ilammy/msvc-dev-cmd#inputs */
export function setupMSVCDevCmd(
  arch,
  vspath,
  sdk,
  toolset,
  uwp,
  spectre,
  vsversion
) {
  if (process.platform != "win32") {
    console.info("This is not a Windows virtual environment, bye!");
    return;
  }

  // Add standard location of "vswhere" to PATH, in case it's not there.
  process.env.PATH += path.delimiter + VSWHERE_PATH;

  // There are all sorts of way the architectures are called. In addition to
  // values supported by Microsoft Visual C++, recognize some common aliases.
  let arch_aliases = {
    win32: "x86",
    win64: "x64",
    x86_64: "x64",
    "x86-64": "x64",
  };
  // Ignore case when matching as that's what humans expect.
  if (arch.toLowerCase() in arch_aliases) {
    arch = arch_aliases[arch.toLowerCase()];
  }

  // Due to the way Microsoft Visual C++ is configured, we have to resort to the following hack:
  // Call the configuration batch file and then output *all* the environment variables.

  var args = [arch];
  if (uwp == "true") {
    args.push("uwp");
  }
  if (sdk) {
    args.push(sdk);
  }
  if (toolset) {
    args.push(`-vcvars_ver=${toolset}`);
  }
  if (spectre == "true") {
    args.push("-vcvars_spectre_libs=spectre");
  }

  const vcvars = `"${findVcvarsall(vsversion, vspath)}" ${args.join(" ")}`;
  console.debug(`vcvars command-line: ${vcvars}`);
  refreshEnv(vcvars, /^\[ERROR.*\]/)
  console.info(`Configured Developer Command Prompt`);
}
