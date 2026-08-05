#!/bin/zsh
set -eu

server_directory="${0:A:h}"
cd "$server_directory"
open "http://localhost:8000/"
exec ./mongoose_macos -l http://127.0.0.1:8000 -d "$server_directory"
