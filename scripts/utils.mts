import 'zx/globals'
import { PathOrFileDescriptor } from 'fs'

// Check cmd in env, return the cmd list that not found
export function findCmdsInEnv(cmdList: string[]) {
  let not_found_cmds = cmdList.filter((cmd) => {
    return which.sync(cmd, { nothrow: true }) === null
  })
  return not_found_cmds
}

export function loadFromJson(jsonFilePath: PathOrFileDescriptor) {
  try {
    const content = fs.readFileSync(jsonFilePath, 'utf8')
    const object = JSON.parse(content)
    return object
  } catch {
    throw new Error("Failed to load json file")
  }
}

export function saveToJson(jsonFilePath: PathOrFileDescriptor, object: Object) {
  fs.writeFileSync(jsonFilePath, JSON.stringify(object, null, 4))
}
