import child_process from "child_process";
import process from "process";
import 'zx/globals'

export function refreshEnv(cmd: string, error_message_pattern?: RegExp) {
  const envList = getEnvDiff(cmd, error_message_pattern)
  for (const [name, value] of envList) {
    process.env[name] = value
  }
}

// Run a command in a shell and return the environment variables been changed
export function getEnvDiff(cmd: string, error_message_pattern?: RegExp): Map<string, string> {
  let old_environment: string[] = []
  let script_output: string[] = []
  let new_environment: string[] = []
  if (process.platform == "win32") {
    const cmd_output_string = child_process
   .execSync(`set && cls && ${cmd} && cls && set`.replaceAll("/","\\"), { shell: "cmd" })
      .toString();
    const cmd_output_parts = cmd_output_string.split("\f");
    old_environment = cmd_output_parts[0].split("\r\n");
    script_output = cmd_output_parts[1].split("\r\n");
    new_environment = cmd_output_parts[2].split("\r\n");
  } else if (process.platform == "linux") {
    // 参照 ~/.bashrc 中的代码段
    //``` # If not running interactively, don't do anything
    //    [[ $- != *i* ]] && return ```
    // 为了避免非交互式shell执行脚本时，直接退出而无法设置环境变量，需要显示指定交互式'-i'
    // BUG: 增加 '-i'参数导致github action报错
    // bash: cannot set terminal process group (829): Inappropriate ioctl for device
    // bash: no job control in this shell
    // 解决方案:将环境变量放到~/.profile中,见
    // https://unix.stackexchange.com/questions/758273/how-to-export-global-variables-to-child-process-in-bash
    const cmd_output_string = child_process
      .execSync(`env && echo \f && ${cmd} && echo \f && env`, { shell: "bash" })
      .toString();
    const cmd_output_parts = cmd_output_string.split("\f\n");
    old_environment = cmd_output_parts[0].split("\n").filter(item => item.length > 0);
    script_output = cmd_output_parts[1].split("\n").filter(item => item.length > 0);
    new_environment = cmd_output_parts[2].split("\n").filter(item => item.length > 0);
  }

  // If vsvars.bat is given an incorrect command line, it will print out
  // an error and *still* exit successfully. Parse out errors from output
  // which don't look like environment variables, and fail if appropriate.
  if (error_message_pattern !== undefined) {
    const error_messages = script_output.filter((line) => {
      if (line.match(error_message_pattern)) {
        return true;
      }
      return false;
    });
    if (error_messages.length > 0) {
      throw new Error(
        "invalid parameters" + "\r\n" + error_messages.join("\r\n")
      );
    }
  }
  // Convert old environment lines into a dictionary for easier lookup.
  let old_env_vars = {};
  for (let string of old_environment) {
    const [name, value] = string.split("=");
    old_env_vars[name] = value;
  }

  // Now look at the new environment and export everything that changed.
  // These are the variables set by vsvars.bat. Also export everything
  // that was not there during the first sweep: those are new variables.
  let envList = new Map<string, string>();
  for (let string of new_environment) {
    // vsvars.bat likes to print some fluff at the beginning.
    // Skip lines that don't look like environment variables.
    if (!string.includes("=")) {
      continue;
    }
    let [name, new_value] = string.split("=");
    let old_value = old_env_vars[name];
    // For new variables "old_value === undefined".
    if (new_value !== old_value) {
      // Special case for a bunch of PATH-like variables: vcvarsall.bat
      // just prepends its stuff without checking if its already there.
      // This makes repeated invocations of this action fail after some
      // point, when the environment variable overflows. Avoid that.
      if (isPathVariable(name)) {
        new_value = filterPathValue(new_value);
      }
      envList.set(name, new_value)
    }
  }
  return envList;
}

function filterPathValue(path: string) {
  function unique(value: string, index: number, self: string[]) {
    return self.indexOf(value) === index;
  }
  let paths: string[] = [];
  if (process.platform == 'win32') {
    paths = path.split(";");
    // Remove duplicates by keeping the first occurance and preserving order.
    // This keeps path shadowing working as intended.
    return paths.filter(unique).join(";");
  }
  else if (process.platform == 'linux') {
    paths = path.split(":");
    return paths.filter(unique).join(":");
  } else {
    throw new Error("Unsupported platform");
  }
}

function isPathVariable(name: string) {
  // TODO: Add more variables to the list.
  const pathLikeVariables = ["PATH", "INCLUDE", "LIB", "LIBPATH"];
  return pathLikeVariables.indexOf(name.toUpperCase()) != -1;
}
