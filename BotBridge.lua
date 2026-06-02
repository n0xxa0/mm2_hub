-- BotBridge.lua
-- À placer dans : ServerScriptService dans ton serveur privé MM2
-- (via Roblox Studio, en mode Edit du serveur privé)
--
-- Ce script notifie le bot Node.js quand des joueurs arrivent/partent.
-- Il permet aussi d'afficher un message aux joueurs pour qu'ils envoient un trade.

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")

-- ── Config ────────────────────────────────────────────────────────────────────
-- Remplace par l'URL de ton bot (ngrok, Cloudflare Tunnel, ou IP de ton VPS)
local BOT_BRIDGE_URL = "https://TON-NGROK-OU-VPS.ngrok.io" -- ex: "https://abc123.ngrok.io"
local BRIDGE_SECRET  = "TON_BRIDGE_SECRET" -- Même valeur que dans .env

-- Username Roblox du bot (pour afficher dans le message)
local BOT_USERNAME = "TonBotUsername"

-- ── Helper HTTP ───────────────────────────────────────────────────────────────
local function notify(endpoint, payload)
	local ok, err = pcall(function()
		HttpService:PostAsync(
			BOT_BRIDGE_URL .. endpoint,
			HttpService:JSONEncode(payload),
			Enum.HttpContentType.ApplicationJson
		)
	end)
	if not ok then
		warn("[BotBridge] Erreur HTTP vers " .. endpoint .. " : " .. tostring(err))
	end
end

-- ── Quand un joueur arrive ────────────────────────────────────────────────────
Players.PlayerAdded:Connect(function(player)
	-- Attendre que le personnage soit chargé
	player.CharacterAdded:Wait()
	task.wait(2)

	-- Notifie le bot Node.js
	notify("/bridge/player-arrived", {
		secret         = BRIDGE_SECRET,
		robloxUserId   = tostring(player.UserId),
		robloxUsername = player.Name,
	})

	-- Affiche un message de bienvenue au joueur via GUI
	local screenGui = Instance.new("ScreenGui")
	screenGui.Name = "MM2HubBridge"
	screenGui.ResetOnSpawn = false
	screenGui.Parent = player.PlayerGui

	local frame = Instance.new("Frame")
	frame.Size = UDim2.new(0, 380, 0, 100)
	frame.Position = UDim2.new(0.5, -190, 0, 20)
	frame.BackgroundColor3 = Color3.fromRGB(20, 20, 30)
	frame.BorderSizePixel = 0
	frame.Parent = screenGui

	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 10)
	corner.Parent = frame

	local label = Instance.new("TextLabel")
	label.Size = UDim2.new(1, -20, 1, -10)
	label.Position = UDim2.new(0, 10, 0, 5)
	label.BackgroundTransparency = 1
	label.TextColor3 = Color3.fromRGB(255, 255, 255)
	label.TextWrapped = true
	label.TextSize = 15
	label.Font = Enum.Font.GothamBold
	label.Text = "🎮 MM2 Hub — Envoie une demande de trade à @" .. BOT_USERNAME .. " pour scanner ton inventaire !"
	label.Parent = frame

	-- Cache le message après 8 secondes
	task.delay(8, function()
		if screenGui and screenGui.Parent then
			screenGui:Destroy()
		end
	end)
end)

-- ── Quand un joueur part ──────────────────────────────────────────────────────
Players.PlayerRemoving:Connect(function(player)
	notify("/bridge/player-left", {
		secret         = BRIDGE_SECRET,
		robloxUserId   = tostring(player.UserId),
		robloxUsername = player.Name,
	})
end)

print("[BotBridge] ✅ Script actif — En attente de joueurs...")
