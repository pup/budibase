const helpers = require("handlebars-helpers")
const { HelperFunctionBuiltin } = require("../src/helpers/constants")
const fs = require("fs")
const doctrine = require("doctrine")

const FILENAME = "../manifest.json"

/**
 * full list of supported helpers can be found here:
 * https://github.com/helpers/handlebars-helpers
 */

const COLLECTIONS = ["math", "array", "number", "url", "string", "comparison"]

const outputJSON = {}

function fixSpecialCases(name, obj) {
  const args = obj.args
  if (name === "ifNth") {
    args[0] = "a"
    args[1] = "b"
  }
  if (name === "eachIndex") {
    obj.description = "Iterates the array, listing an item and the index of it."
  }
  if (name === "toFloat") {
    obj.description = "Convert input to a float."
  }
  if (name === "toInt") {
    obj.description = "Convert input to an integer."
  }
  // add the date helper
  obj
  return obj
}

function lookForward(lines, funcLines, idx) {
  const funcLen = funcLines.length
  for (let i = idx, j = 0; i < idx + funcLen; ++i, j++) {
    if (!lines[i].includes(funcLines[j])) {
      return false
    }
  }
  return true
}

function getCommentInfo(file, func) {
  const lines = file.split("\n")
  const funcLines = func.split("\n")
  let comment = null
  for (let idx = 0; idx < lines.length; ++idx) {
    // from here work back until we have the comment
    if (lookForward(lines, funcLines, idx)) {
      let fromIdx = idx
      let start = 0,
        end = 0
      do {
        if (lines[fromIdx].includes("*/")) {
          end = fromIdx
        } else if (lines[fromIdx].includes("/*")) {
          start = fromIdx
        }
        if (start && end) {
          break
        }
        fromIdx--
      } while (fromIdx > 0)
      comment = lines.slice(start, end + 1).join("\n")
    }
  }
  if (comment == null) {
    return { description: "" }
  }
  const docs = doctrine.parse(comment, { unwrap: true })
  // some hacky fixes
  docs.description = docs.description.replace(/\n/g, " ")
  docs.description = docs.description.replace(/[ ]{2,}/g, " ")
  docs.description = docs.description.replace(/is is/g, "is")
  const example = docs.description.split("```")
  if (example.length > 1) {
    docs.example = example[1]
  }
  docs.description = example[0].trim()
  return docs
}

/**
 * This script is very specific to purpose, parsing the handlebars-helpers files to attempt to get information about them.
 */
function run() {
  const foundNames = []
  for (let collection of COLLECTIONS) {
    const collectionFile = fs.readFileSync(
      `../node_modules/handlebars-helpers/lib/${collection}.js`,
      "utf8"
    )
    const collectionInfo = {}
    // collect information about helper
    let hbsHelperInfo = helpers[collection]()
    for (let entry of Object.entries(hbsHelperInfo)) {
      const name = entry[0]
      // skip built in functions and ones seen already
      if (
        HelperFunctionBuiltin.indexOf(name) !== -1 ||
        foundNames.indexOf(name) !== -1
      ) {
        continue
      }
      foundNames.push(name)
      // this is ridiculous, but it parse the function header
      const fnc = entry[1].toString()
      const jsDocInfo = getCommentInfo(collectionFile, fnc)
      let args = jsDocInfo.tags
        .filter(tag => tag.title === "param")
        .map(
          tag =>
            tag.description &&
            tag.description
              .replace(/`/g, "")
              .split(" ")[0]
              .trim()
        )
      collectionInfo[name] = fixSpecialCases(name, {
        args,
        numArgs: args.length,
        example: jsDocInfo.example || undefined,
        description: jsDocInfo.description,
      })
    }
    outputJSON[collection] = collectionInfo
  }
  // add the date helper
  outputJSON["date"] = {
    date: {
      args: ["datetime", "format"],
      numArgs: 2,
      example: '{{date now "YYYY"}}',
      description: "Format a date using moment.js data formatting.",
    },
  }
  fs.writeFileSync(FILENAME, JSON.stringify(outputJSON, null, 2))
}

run()
