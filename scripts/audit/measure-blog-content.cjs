// Measures real body-content volume per blog post.
//
// AdSense "insufficient content" decisions are about substantive original BODY
// text, not titles. Posts in this codebase are keyed by slug as object keys
// (`"my-slug": { title, excerpt, content: `...` }`), so we split on the content
// template literals and attribute each to the nearest preceding object key.
const fs = require("node:fs")

const file = process.argv[2] || "app/(public)/blog/[slug]/page.tsx"
const src = fs.readFileSync(file, "utf8")

// Object keys that open a post: `"slug-name": {`
const keyRe = /"([a-z0-9-]{4,})"\s*:\s*\{/g
const keys = []
let km
while ((km = keyRe.exec(src)) !== null) keys.push({ slug: km[1], at: km.index })

// content: `...` template literals (may contain escaped backticks)
const contentRe = /content:\s*`((?:[^`\\]|\\.)*)`/g
const contents = []
let cm
while ((cm = contentRe.exec(src)) !== null) {
  contents.push({ at: cm.index, text: cm[1] })
}

const plain = (s) =>
  s
    .replace(/```[\s\S]*?```/g, " ") // fenced code
    .replace(/\|[^\n]*\|/g, " ") // md tables
    .replace(/[#*_>`\-]/g, " ")
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()

let total = 0
let thin = 0
const rows = []
for (const c of contents) {
  let owner = "?"
  for (const k of keys) {
    if (k.at < c.at) owner = k.slug
    else break
  }
  const words = plain(c.text).split(" ").filter(Boolean).length
  total += words
  if (words < 600) thin++
  rows.push({ slug: owner, words })
}

rows.sort((a, b) => a.words - b.words)
for (const r of rows) {
  console.log(String(r.words).padStart(6) + " words | " + r.slug.slice(0, 56))
}
console.log("----")
console.log("posts with content:", rows.length)
console.log("total body words:", total)
console.log("avg words/post:", rows.length ? Math.round(total / rows.length) : 0)
console.log("posts under 600 words:", thin)
