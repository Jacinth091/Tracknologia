#!/usr/bin/env bash
# Promotion-path policy for protected branches. Kept as a script so the
# Bash pattern matrix can be exercised by tests/contracts/branch-policy.
set -euo pipefail

base="${1:-}"
head="${2:-}"

if [[ -z "$base" || -z "$head" ]]; then
  echo "::error::Both base and head branch names are required."
  exit 1
fi

echo "Validating pull request: ${head} -> ${base}"

# Developer/fork branch names are intentionally unrestricted.
# Any branch may submit a PR into a protected feature integration branch.
if [[ "$base" == feature/* ]]; then
  echo "Valid contributor PR into feature integration branch."
  exit 0
fi

# The issue-number segment is digits only: one digit or more, then the name.
feature_source='^feature/[0-9]+/.+$'

if [[ "$base" == "staging" ]]; then
  if [[ "$head" =~ $feature_source ]]; then
    echo "Valid feature promotion into staging."
  elif [[ "$head" == fix/* || "$head" == hotfix/* || "$head" == chore/* || "$head" == dependabot/* ]]; then
    echo "Valid maintenance promotion into staging."
  elif [[ "$head" == release/* ]]; then
    echo "Valid release promotion into staging."
  else
    echo "::error::Invalid source branch for staging."
    echo "Expected feature/N.../name, fix/*, hotfix/*, chore/*, dependabot/*, or release/*."
    exit 1
  fi
  exit 0
fi

# Release integration branches accept the same approved sources as staging.
if [[ "$base" == release/* ]]; then
  if [[ "$head" =~ $feature_source ]]; then
    echo "Valid feature integration into release branch."
  elif [[ "$head" == fix/* || "$head" == hotfix/* || "$head" == chore/* || "$head" == dependabot/* ]]; then
    echo "Valid maintenance integration into release branch."
  else
    echo "::error::Invalid source branch for release branch."
    echo "Expected feature/N.../name, fix/*, hotfix/*, chore/*, or dependabot/*."
    exit 1
  fi
  exit 0
fi

# Master accepts releases only from staging.
if [[ "$base" == "main" ]]; then
  if [[ "$head" != "staging" ]]; then
    echo "::error::Only staging may be merged into main."
    exit 1
  fi
  echo "Valid release promotion: staging -> main"
  exit 0
fi

echo "::error::Unexpected protected target branch: $base"
exit 1
