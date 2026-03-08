$ErrorActionPreference = "Stop"

$apiBase = "http://127.0.0.1:8080"
$wsUrl = "ws://127.0.0.1:8080/ws"
$webUrl = "http://localhost:5173"
$origin = "http://localhost:5173"

function Connect-AuthorizedWebSocket([string]$token) {
  $ws = [System.Net.WebSockets.ClientWebSocket]::new()
  $ws.Options.AddSubProtocol("durak.v1")
  $ws.Options.AddSubProtocol("auth.$token")
  $uri = [Uri]::new($wsUrl)
  $ws.ConnectAsync($uri, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  return $ws
}

function Send-Json([System.Net.WebSockets.ClientWebSocket]$ws, $payload) {
  $json = $payload | ConvertTo-Json -Compress -Depth 20
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $segment = [ArraySegment[byte]]::new($bytes)
  $ws.SendAsync(
    $segment,
    [System.Net.WebSockets.WebSocketMessageType]::Text,
    $true,
    [Threading.CancellationToken]::None
  ).GetAwaiter().GetResult()
}

function Receive-Json([System.Net.WebSockets.ClientWebSocket]$ws) {
  $buffer = New-Object byte[] 65536
  $segment = [ArraySegment[byte]]::new($buffer)
  $builder = [System.Text.StringBuilder]::new()
  do {
    $result = $ws.ReceiveAsync($segment, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
      throw "WebSocket closed before message received"
    }
    $builder.Append([System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count)) | Out-Null
  } while (-not $result.EndOfMessage)

  return $builder.ToString() | ConvertFrom-Json
}

function Wait-ForMessageType([System.Net.WebSockets.ClientWebSocket]$ws, [string]$expectedType) {
  while ($true) {
    $message = Receive-Json $ws
    if ($message.type -eq $expectedType) {
      return $message
    }
  }
}

$frontendResponse = Invoke-WebRequest -UseBasicParsing -Uri $webUrl
$healthResponse = Invoke-RestMethod -Method Get -Uri "$apiBase/health"

$headers = @{
  "content-type" = "application/json"
  "Origin" = $origin
}

$aliceAuth = Invoke-RestMethod -Method Post -Uri "$apiBase/auth/dev" -Headers $headers -Body (
  @{ playerName = "Alice"; clientId = "task6-alice-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" } | ConvertTo-Json
)
$bobAuth = Invoke-RestMethod -Method Post -Uri "$apiBase/auth/dev" -Headers $headers -Body (
  @{ playerName = "Bob"; clientId = "task6-bob-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" } | ConvertTo-Json
)

$wsAlice = Connect-AuthorizedWebSocket $aliceAuth.token
Send-Json $wsAlice @{ type = "room.create" }
$created = Wait-ForMessageType $wsAlice "room.created"
$roomId = $created.room.roomId

$wsBob = Connect-AuthorizedWebSocket $bobAuth.token
Send-Json $wsBob @{ type = "room.join"; roomId = $roomId }
$joined = Wait-ForMessageType $wsBob "room.joined"
$playersForAlice = Wait-ForMessageType $wsAlice "room.players"

Send-Json $wsAlice @{ type = "room.start"; roomId = $roomId; mode = "simple" }
$startedForAlice = Wait-ForMessageType $wsAlice "room.started"
$startedForBob = Wait-ForMessageType $wsBob "room.started"

$alicePlayers = @($playersForAlice.room.players | ForEach-Object { $_.name } | Sort-Object)
$bobPlayers = @($joined.room.players | ForEach-Object { $_.name } | Sort-Object)

$result = [pscustomobject]@{
  frontendReachable = ($frontendResponse.StatusCode -eq 200)
  backendHealth = $healthResponse
  webSocketUrl = $wsUrl
  createRoom = [pscustomobject]@{
    ok = ($created.type -eq "room.created")
    roomId = $roomId
    hostName = $aliceAuth.user.displayName
  }
  joinRoom = [pscustomobject]@{
    ok = ($joined.type -eq "room.joined")
    guestName = $bobAuth.user.displayName
  }
  sharedRoomRoster = [pscustomobject]@{
    sameRoomId = ($playersForAlice.room.roomId -eq $joined.room.roomId)
    samePlayers = ((($alicePlayers -join "|") -eq ($bobPlayers -join "|")))
    players = $alicePlayers
  }
  sharedGameState = [pscustomobject]@{
    sameMatchId = ($startedForAlice.state.matchId -eq $startedForBob.state.matchId)
    sameVersion = ($startedForAlice.state.version -eq $startedForBob.state.version)
    sameMode = ($startedForAlice.state.mode -eq $startedForBob.state.mode)
    matchId = $startedForAlice.state.matchId
    version = $startedForAlice.state.version
    mode = $startedForAlice.state.mode
  }
}

$wsAlice.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", [Threading.CancellationToken]::None).GetAwaiter().GetResult()
$wsBob.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", [Threading.CancellationToken]::None).GetAwaiter().GetResult()
$wsAlice.Dispose()
$wsBob.Dispose()

$result | ConvertTo-Json -Depth 20
