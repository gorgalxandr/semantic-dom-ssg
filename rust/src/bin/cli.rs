//! CLI tool for semantic-dom-ssg
//!
//! Provides command-line access to SemanticDOM parsing, validation,
//! and token-efficient output formats.
//!
//! Exit codes: `0` success, `1` certification below the required level
//! (`validate --ci`), `2` usage error, `3` input could not be read or parsed.

use clap::{Args, Parser, Subcommand, ValueEnum};
use semantic_dom_ssg::{AgentCertification, CertificationLevel, Config, SemanticDOM};
use std::fmt::Write as _;
use std::io::{self, Write as _};
use std::process::ExitCode;

/// Certification is below the level required by `validate --ci`
const EXIT_VALIDATION_FAILED: u8 = 1;
/// Input could not be read, is too large, or output could not be produced
const EXIT_INPUT_ERROR: u8 = 3;

#[derive(Parser)]
#[command(name = "semantic-dom", author, version)]
#[command(about = "Machine-readable web semantics for AI agents", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

/// Input options shared by every subcommand
#[derive(Args)]
struct InputArgs {
    /// Input file (use '-' for stdin)
    #[arg(value_name = "FILE")]
    input: String,

    /// Maximum input size in bytes
    #[arg(long, value_name = "BYTES", default_value_t = Config::default().max_input_size)]
    max_input_size: usize,

    /// Maximum element nesting depth to analyse
    #[arg(long, value_name = "DEPTH", default_value_t = Config::default().max_depth)]
    max_depth: usize,
}

#[derive(Subcommand)]
enum Commands {
    /// Parse an HTML file and output SemanticDOM
    Parse {
        #[command(flatten)]
        input: InputArgs,

        /// Output format
        #[arg(short, long, value_enum, default_value = "json")]
        format: OutputFormat,

        /// Pretty print JSON output (the default; kept for compatibility)
        #[arg(short, long, conflicts_with = "compact")]
        pretty: bool,

        /// Print JSON on a single line
        #[arg(short, long)]
        compact: bool,
    },

    /// Validate an HTML file for agent compatibility
    Validate {
        #[command(flatten)]
        input: InputArgs,

        /// Minimum certification level required
        #[arg(short, long, value_enum, default_value = "a")]
        level: CertLevel,

        /// Exit with error if validation fails (for CI)
        #[arg(long)]
        ci: bool,
    },

    /// Show token usage comparison between formats
    Tokens {
        #[command(flatten)]
        input: InputArgs,
    },
}

#[derive(Clone, ValueEnum)]
enum OutputFormat {
    /// Full JSON output
    Json,
    /// Token-efficient summary (~100 tokens)
    Summary,
    /// One-line summary (~20 tokens)
    Oneline,
    /// Navigation-focused summary
    Nav,
}

#[derive(Clone, ValueEnum)]
enum CertLevel {
    /// Level A (basic)
    A,
    /// Level AA (intermediate)
    Aa,
    /// Level AAA (full)
    Aaa,
}

impl From<CertLevel> for CertificationLevel {
    fn from(level: CertLevel) -> Self {
        match level {
            CertLevel::A => CertificationLevel::A,
            CertLevel::Aa => CertificationLevel::AA,
            CertLevel::Aaa => CertificationLevel::AAA,
        }
    }
}

fn main() -> ExitCode {
    // clap reports usage errors on stderr and exits with code 2
    let cli = Cli::parse();

    let (output, code) = match run(cli) {
        Ok(result) => result,
        Err(message) => {
            eprintln!("error: {message}");
            return ExitCode::from(EXIT_INPUT_ERROR);
        }
    };

    match io::stdout().lock().write_all(output.as_bytes()) {
        Ok(()) => ExitCode::from(code),
        // The reader went away (e.g. `| head`): not an error
        Err(e) if e.kind() == io::ErrorKind::BrokenPipe => ExitCode::from(code),
        Err(e) => {
            eprintln!("error: cannot write output: {e}");
            ExitCode::from(EXIT_INPUT_ERROR)
        }
    }
}

/// Execute a command, returning the text for stdout and the exit code
fn run(cli: Cli) -> Result<(String, u8), String> {
    match cli.command {
        Commands::Parse {
            input,
            format,
            pretty: _,
            compact,
        } => {
            let sdom = load(&input)?;
            let mut output = match format {
                OutputFormat::Json if compact => sdom.to_json_compact(),
                OutputFormat::Json => sdom.to_json(),
                OutputFormat::Summary => Ok(sdom.to_agent_summary()),
                OutputFormat::Oneline => Ok(sdom.to_one_liner()),
                OutputFormat::Nav => Ok(semantic_dom_ssg::to_nav_summary(&sdom)),
            }
            .map_err(|e| format!("cannot serialize output: {e}"))?;
            output.push('\n');
            Ok((output, 0))
        }

        Commands::Validate { input, level, ci } => {
            let sdom = load(&input)?;
            let cert = AgentCertification::certify(&sdom);
            let required = CertificationLevel::from(level);
            let meets = cert.level >= required;

            let mut output = certification_report(&cert);
            let verdict = if meets {
                format!("✓ Meets {} requirements", required.name())
            } else {
                format!("✗ Does not meet {} requirements", required.name())
            };
            output.push_str(&verdict);
            output.push('\n');

            let code = if ci && !meets {
                EXIT_VALIDATION_FAILED
            } else {
                0
            };
            Ok((output, code))
        }

        Commands::Tokens { input } => {
            let sdom = load(&input)?;
            let comparison = semantic_dom_ssg::compare_token_usage(&sdom);
            let output = format!(
                "Token Usage Comparison\n\
                 ======================\n\
                 \n\
                 Format          Tokens    Reduction\n\
                 ------          ------    ---------\n\
                 JSON            {:>6}    (baseline)\n\
                 Summary         {:>6}    {:>5.1}%\n\
                 One-liner       {:>6}    {:>5.1}%\n",
                comparison.json_tokens,
                comparison.summary_tokens,
                comparison.summary_reduction,
                comparison.one_liner_tokens,
                comparison.one_liner_reduction
            );
            Ok((output, 0))
        }
    }
}

/// Render the human-readable certification report
fn certification_report(cert: &AgentCertification) -> String {
    let mut out = String::new();
    // Writing to a String cannot fail
    let _ = writeln!(out, "{} SemanticDOM Certification", cert.level.badge());
    let _ = writeln!(out, "Level: {} (Score: {})", cert.level.name(), cert.score);
    let _ = writeln!(out, "\nStatistics:");
    let _ = writeln!(out, "  Landmarks: {}", cert.stats.landmark_count);
    let _ = writeln!(out, "  Interactables: {}", cert.stats.interactable_count);
    let _ = writeln!(out, "  Headings: {}", cert.stats.heading_count);
    let _ = writeln!(
        out,
        "  Completeness: {:.1}%",
        cert.stats.completeness * 100.0
    );
    let _ = writeln!(
        out,
        "\nChecks: {}/{} passed\n",
        cert.stats.passed_checks, cert.stats.total_checks
    );

    let failed: Vec<_> = cert.checks.iter().filter(|c| !c.passed).collect();
    if !failed.is_empty() {
        let _ = writeln!(out, "Failed checks:");
        for check in failed {
            let details = check.details.as_deref().unwrap_or(&check.name);
            let _ = writeln!(out, "  ❌ {} - {}", check.id, details);
        }
        let _ = writeln!(out);
    }
    out
}

/// Read and parse the input, enforcing the size limit while reading
fn load(args: &InputArgs) -> Result<SemanticDOM, String> {
    let config = Config {
        max_input_size: args.max_input_size,
        max_depth: args.max_depth,
        ..Config::default()
    };

    let result = if args.input == "-" {
        SemanticDOM::from_reader(io::stdin().lock(), config)
    } else {
        SemanticDOM::from_file(&args.input, config)
    };
    result.map_err(|e| {
        let source = if args.input == "-" {
            "<stdin>"
        } else {
            args.input.as_str()
        };
        format!("{source}: {e}")
    })
}
