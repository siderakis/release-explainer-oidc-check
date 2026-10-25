# release-explainer-oidc-check

A test harness for publishing explainers from GitHub Actions with the
workflow's own GitHub OIDC identity, no Bisque account. It carries a copy of
the [bisque-cloud/presenter](https://github.com/bisque-cloud/presenter)
action under test.

- `OIDC publish check` publishes `fixture/` with no model and no secret.
- `Pull request explainer` is the `/explain` workflow from
  [bisque.today/docs/github](https://bisque.today/docs/github), run from this
  copy, on a Claude plan token.

Explainers land at `bisque.today/p/siderakis/release-explainer-oidc-check`.

- `cca-pull-request-explainer.yml` is
  `examples/claude-code-action-pull-request-explainer.yml` from
  bisque-cloud/presenter, unedited: the plugin from the public marketplace and
  `bisque-cloud/presenter@v1`, so it tests the released action rather than
  this repository's copy.
