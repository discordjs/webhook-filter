# webhook-filter
This is a simple application that filters out push events for specific branches of specific repositories from a GitHub
webhook, forwarding all others to another destination.

## Configuration
All configuration is specified in a `config.json` file in the current working directory when launching the application.

### Example
```json
{
	"secret": "This is a secret.",
	"webhook": "https://some-webhook.site/webhook",
	"blacklist": {
		"someone/some-repo": ["some-branch", "some-other-branch"],
		"someone/cooler-repo": ["would-you-believe-it-its-yet-another-branch"]
	}
}
```
