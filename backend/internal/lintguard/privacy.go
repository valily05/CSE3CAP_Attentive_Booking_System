// Package lintguard holds project rules that ordinary linters cannot express.
// They run as tests, so `go test ./...` and CI enforce them.
package lintguard

import (
	"bufio"
	"bytes"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"regexp"
	"sort"
	"strings"
)

// clinicalTerms are fragments of names that would hold clinical data.
// Matched against identifiers lower-cased with underscores removed.
var clinicalTerms = []string{
	"diagnos", "therapynote", "sessionnote", "clinicalnote", "casenote",
	"symptom", "complaint", "medication", "prescription", "presentingproblem",
	"reasonforvisit", "mentalcondition", "gejala", "keluhan", "diagnosa",
}

// Finding is one forbidden name.
type Finding struct {
	File string
	Line int
	Name string
}

func (f Finding) String() string { return fmt.Sprintf("%s:%d %s", f.File, f.Line, f.Name) }

func clinical(name string) bool {
	n := strings.ReplaceAll(strings.ToLower(name), "_", "")
	for _, t := range clinicalTerms {
		if strings.Contains(n, t) {
			return true
		}
	}
	return false
}

// ScanPrivacy checks Go identifiers and SQL migration identifiers in fsys.
// Comments and string literals are ignored: it is fine to *say* we never
// store a diagnosis, but not to have a field for one.
func ScanPrivacy(fsys fs.FS) []Finding {
	var out []Finding
	_ = fs.WalkDir(fsys, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil //nolint:nilerr // unreadable paths are skipped, not fatal
		}
		if d.IsDir() {
			switch d.Name() {
			case "node_modules", ".git", "testdata", ".next":
				return fs.SkipDir
			}
			return nil
		}
		data, rerr := fs.ReadFile(fsys, p)
		if rerr != nil {
			return nil //nolint:nilerr // see above
		}
		switch {
		case strings.HasSuffix(p, ".go"):
			out = append(out, scanGo(p, data)...)
		case strings.HasSuffix(p, ".sql"):
			out = append(out, scanSQL(p, data)...)
		}
		return nil
	})
	sort.Slice(out, func(i, j int) bool { return out[i].String() < out[j].String() })
	return out
}

func scanGo(p string, src []byte) []Finding {
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, p, src, parser.SkipObjectResolution)
	if err != nil {
		return nil
	}
	var out []Finding
	ast.Inspect(f, func(n ast.Node) bool {
		if id, ok := n.(*ast.Ident); ok && clinical(id.Name) {
			out = append(out, Finding{File: p, Line: fset.Position(id.Pos()).Line, Name: id.Name})
		}
		return true
	})
	return out
}

var sqlIdent = regexp.MustCompile(`[A-Za-z_][A-Za-z0-9_]*`)

func scanSQL(p string, src []byte) []Finding {
	var out []Finding
	sc := bufio.NewScanner(bytes.NewReader(src))
	for line := 1; sc.Scan(); line++ {
		code, _, _ := strings.Cut(sc.Text(), "--")
		for _, name := range sqlIdent.FindAllString(code, -1) {
			if clinical(name) {
				out = append(out, Finding{File: p, Line: line, Name: name})
			}
		}
	}
	return out
}
