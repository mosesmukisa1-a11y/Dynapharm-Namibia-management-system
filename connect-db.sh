#!/bin/sh
# Retired: this legacy helper embedded a database credential.
# No connection, environment mutation or database operation is permitted here.
printf "%s\n" "Disabled insecure legacy helper. Use the reviewed database operations process." >&2
exit 1
