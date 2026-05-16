import nock from "nock"

import "./utils/path" // Import to enable String.prototype.toPosix().

// Disable network requests by default for all tests.
nock.disableNetConnect()

// simple-git (3.36+) bundles @simple-git/argv-parser, which rejects spawning git
// whenever the inherited process env contains any of a known list of "unsafe"
// vars (CVE mitigation against credential / RCE exfiltration via process env).
// VS Code injects GIT_ASKPASS into integrated-terminal env, the rebase helper
// in this repo sets GIT_EDITOR, etc. - none of which any test actually needs.
// Production code already strips git-related env via createSanitizedGit() in
// the checkpoint service, so dropping them here only affects the test process.
//
// The list mirrors the env-var keys @simple-git/argv-parser checks (see its
// dist/index.mjs map "y"); keep this in sync if simple-git is upgraded.
const UNSAFE_GIT_ENV_VARS = [
	"EDITOR",
	"GIT_ASKPASS",
	"GIT_CONFIG",
	"GIT_CONFIG_COUNT",
	"GIT_CONFIG_GLOBAL",
	"GIT_CONFIG_SYSTEM",
	"GIT_EDITOR",
	"GIT_EXEC_PATH",
	"GIT_EXTERNAL_DIFF",
	"GIT_PAGER",
	"GIT_PROXY_COMMAND",
	"GIT_SEQUENCE_EDITOR",
	"GIT_SSH",
	"GIT_SSH_COMMAND",
	"GIT_TEMPLATE_DIR",
	"PAGER",
	"PREFIX",
	"SSH_ASKPASS",
] as const

for (const key of UNSAFE_GIT_ENV_VARS) {
	delete process.env[key]
}

export function allowNetConnect(host?: string | RegExp) {
	if (host) {
		nock.enableNetConnect(host)
	} else {
		nock.enableNetConnect()
	}
}

// Global mocks that many tests expect.
global.structuredClone = global.structuredClone || ((obj: any) => JSON.parse(JSON.stringify(obj)))
