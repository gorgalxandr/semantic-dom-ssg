# Homebrew formula for semantic-dom-ssg
# Install: brew install gorgalxandr/tap/semantic-dom-ssg

class SemanticDomSsg < Formula
  desc "CLI for SemanticDOM and Semantic State Graph - O(1) lookup, agent-ready web interoperability"
  homepage "https://github.com/gorgalxandr/semantic-dom-ssg"
  url "https://github.com/gorgalxandr/semantic-dom-ssg/archive/refs/tags/v0.1.0.tar.gz"
  sha256 "PLACEHOLDER_SHA256"
  license "MIT"
  head "https://github.com/gorgalxandr/semantic-dom-ssg.git", branch: "main"

  depends_on "node" => :build

  def install
    system "npm", "install", *Language::Node.local_npm_install_args
    system "npm", "run", "build"

    # Install CLI binary
    bin.install "dist/cli.js" => "semantic-dom"

    # Create wrapper script
    (bin/"semantic-dom").write <<~EOS
      #!/bin/bash
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/cli.js" "$@"
    EOS

    # Install library files
    libexec.install "dist"
    libexec.install "package.json"
  end

  test do
    # Test CLI help
    assert_match "SemanticDOM", shell_output("#{bin}/semantic-dom --help")

    # Test parsing simple HTML
    html = "<html><body><main><button>Test</button></main></body></html>"
    output = pipe_output("#{bin}/semantic-dom parse -", html)
    assert_match "button", output
  end
end
