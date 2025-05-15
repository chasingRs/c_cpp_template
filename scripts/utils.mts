import 'zx/globals'
import { PathOrFileDescriptor } from 'fs'
import { assert } from 'console'

// Check cmd in env, return the cmd list that not found
export function checkCmds(cmdList: string[]) {
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

// Find the specific node in the object and replace the value,
// See replaceJsonNode function bellow
export function replaceObjectNode(object: Object, rootNodePath: string, nodeAttribute: [string, string], relativeNodePath: string, nodeValue: Object) {
  let current = object;
  let pathFromRoot = rootNodePath.split('.');
  for (let i = 0; i < pathFromRoot.length; i++) {
    current[pathFromRoot[i]] = current[pathFromRoot[i]] || {};
    current = current[pathFromRoot[i]];
  }
  // Check if the current node is an array
  assert(Array.isArray(current), `The node '${pathFromRoot[pathFromRoot.length - 1]}' is not an array`)
  const index = findNodeInArray(current as Array<Object>, nodeAttribute[0], nodeAttribute[1])
  if (index === -1) {
    throw new Error(`Node with ${nodeAttribute[0]}=${nodeAttribute[1]} not found in ${pathFromRoot[pathFromRoot.length - 1]}`)
  }
  current = current[index]
  pathFromRoot = relativeNodePath.split('.');
  for (let i = 0; i < pathFromRoot.length - 1; i++) {
    current[pathFromRoot[i]] = current[pathFromRoot[i]] || {};
    current = current[pathFromRoot[i]];
  }
  current[pathFromRoot[pathFromRoot.length - 1]] = nodeValue
}

// Save environment variables to json file with specific constraint
// Use the 'where' arg to find the specific node in json file and replace the value
/*
{
  "tasks": [
    {
      "command": "tsx project.mts build intro",
      "group": {
        "kind": "build",
      },
    },
    {
      "command": "tsx project.mts run intro",
      "group": {
        "kind": "run",
      },
    },
  ]
}*/
// eg. to change the value of "commands" in "config.json" where 'group.kind==build' to "tsx project.mts build intro"
// saveToFile("config.json", ([["group.kind", "tsx project.mts build intro"]]), "tasks", ["group.kind", "build"], "intro")
export function replaceJsonNode(filePath: string, rootNodePath: string, where: [string, string], relativeNodePath: string, nodeValue: Object) {
  let object = loadFromJson(filePath)
  replaceObjectNode(object, rootNodePath, where, relativeNodePath, nodeValue)
  saveToJson(filePath, object)
}

function findNodeInArray(array: Array<Object>, propertyPath: string, value: string): number {
  return array.findIndex(task => {
    const keys = propertyPath.split('.');
    let current = task;
    for (const key of keys) {
      if (current[key] === undefined) {
        return false;
      }
      current = current[key];
    }
    return current === value;
  });
}
