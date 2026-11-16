# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the third-party services and devices the integration talks to.

## Good to know

The OpenKarotz API has no authentication and speaks plain HTTP: anyone on the
same network as the rabbit can drive it, take pictures with its webcam and
restart it, with or without this integration. Keep the rabbit on a network you
trust and never expose its web page to the Internet. That is a property of the
rabbit's firmware, not a vulnerability of this integration.

The integration itself stores no secret, only talks to the hosts typed in its
configuration, and its network search is limited to private address ranges.
To work out which range that is, it asks Gladys for one SSDP search (declared
in the manifest and shown on the install screen) and only keeps the addresses
of the devices that answered; nothing about them is stored.
