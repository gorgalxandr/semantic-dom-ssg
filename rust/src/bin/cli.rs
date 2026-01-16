//! CLI tool for semantic-dom-ssg
//!
//! Provides command-line access to SemanticDOM parsing, validation,
//! and token-efficient output formats.

use clap::{Parser, Subcommand, ValueEnum};
use semantic_dom_ssg::{AgentCertification, Config, SemanticDOM};
use std::fs;
use std::io::{self, Read};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "semantic-dom")]
#[command(author = "George Alexander <george@consltr.com>")]
#[command(version)]
#[command(about = "Machine-readable web semantics for AI agents", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Parse an HTML file and output SemanticDOM
    Parse {
        /// Input file (use '-' for stdin)
        #[arg(value_name = "FILE")]
        input: String,

        /// Output format
        #[arg(short, long, default_value = "json")]
        format: OutputFormat,

        /// Pretty print JSON output
        #[arg(short, long)]
        pretty: bool,
    },

    /// Validate an HTML file for agent compatibility
    Validate {
        /// Input file (use '-' for stdin)
        #[arg(value_name = "FILE")]
        input: String,

        /// Minimum certification level required
        #[arg(short, long, default_value = "a")]
        level: CertLevel,

        /// Exit with error if validation fails (for CI)
        #[arg(long)]
        ci: bool,
    },

    /// Show token usage comparison between formats
    Tokens {
        /// Input file (use '-' for stdin)
        #[arg(value_name = "FILE")]
        input: String,
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

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::Parse {
            input,
            format,
            pretty: _,
        } => {
            let html = read_input(&input).expect("Failed to read input");
            let config = Config::default();

            match SemanticDOM::parse(&html, config) {
                Ok(sdom) => {
                    let output = match format {
                        OutputFormat::Json => sdom.to_json().unwrap_or_else(|e| {
                            eprintln!("JSON serialization error: {}", e);
                            std::process::exit(1);
                        }),
                        OutputFormat::Summary => sdom.to_agent_summary(),
                        OutputFormat::Oneline => sdom.to_one_liner(),
                        OutputFormat::Nav => semantic_dom_ssg::to_nav_summary(&sdom),
                    };
                    println!("{}", output);
                }
                Err(e) => {
                    eprintln!("Parse error: {}", e);
                    std::process::exit(1);
                }
            }
        }

        Commands::Validate { input, level, ci } => {
            let html = read_input(&input).expect("Failed to read input");
            let config = Config::default();

            match SemanticDOM::parse(&html, config) {
                Ok(sdom) => {
                    let cert = AgentCertification::certify(&sdom);

                    // Print certification results
                    println!("{} SemanticDOM Certification", cert.level.badge());
                    println!("Level: {} (Score: {})", cert.level.name(), cert.score);
                    println!();
                    println!("Statistics:");
                    println!("  Landmarks: {}", cert.stats.landmark_count);
                    println!("  Interactables: {}", cert.stats.interactable_count);
                    println!("  Headings: {}", cert.stats.heading_count);
                    println!(
                        "  Completeness: {:.1}%",
                        cert.stats.completeness * 100.0
                    );
                    println!();
                    println!(
                        "Checks: {}/{} passed",
                        cert.stats.passed_checks, cert.stats.total_checks
                    );
                    println!();

                    // Print failed checks
                    let failed: Vec<_> = cert.checks.iter().filter(|c| !c.passed).collect();
                    if !failed.is_empty() {
                        println!("Failed checks:");
                        for check in failed {
                            println!(
                                "  ❌ {} - {}",
                                check.id,
                                check.details.as_deref().unwrap_or(&check.name)
                            );
                        }
                        println!();
                    }

                    // Check against required level
                    let required = match level {
                        CertLevel::A => semantic_dom_ssg::CertificationLevel::A,
                        CertLevel::Aa => semantic_dom_ssg::CertificationLevel::AA,
                        CertLevel::Aaa => semantic_dom_ssg::CertificationLevel::AAA,
                    };

                    if cert.level >= required {
                        println!("✓ Meets {} requirements", required.name());
                    } else {
                        println!("✗ Does not meet {} requirements", required.name());
                        if ci {
                            std::process::exit(1);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Parse error: {}", e);
                    std::process::exit(1);
                }
            }
        }

        Commands::Tokens { input } => {
            let html = read_input(&input).expect("Failed to read input");
            let config = Config::default();

            match SemanticDOM::parse(&html, config) {
                Ok(sdom) => {
                    let comparison = semantic_dom_ssg::compare_token_usage(&sdom);

                    println!("Token Usage Comparison");
                    println!("======================");
                    println!();
                    println!("Format          Tokens    Reduction");
                    println!("------          ------    ---------");
                    println!(
                        "JSON            {:>6}    (baseline)",
                        comparison.json_tokens
                    );
                    println!(
                        "Summary         {:>6}    {:>5.1}%",
                        comparison.summary_tokens, comparison.summary_reduction
                    );
                    println!(
                        "One-liner       {:>6}    {:>5.1}%",
                        comparison.one_liner_tokens, comparison.one_liner_reduction
                    );
                }
                Err(e) => {
                    eprintln!("Parse error: {}", e);
                    std::process::exit(1);
                }
            }
        }
    }
}

fn read_input(path: &str) -> io::Result<String> {
    if path == "-" {
        let mut buffer = String::new();
        io::stdin().read_to_string(&mut buffer)?;
        Ok(buffer)
    } else {
        let path = PathBuf::from(path);
        fs::read_to_string(path)
    }
}
