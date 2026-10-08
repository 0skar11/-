-- Builds a simple walled arena with a spawn point when the game starts.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local MapConfig = require(ReplicatedStorage.Shared.MapConfig)

local MAP_NAME = "GeneratedMap"

local function makePart(parent: Instance, name: string, size: Vector3, position: Vector3, color: Color3): Part
	local part = Instance.new("Part")
	part.Name = name
	part.Anchored = true
	part.Size = size
	part.Position = position
	part.Color = color
	part.Material = Enum.Material.Slate
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.Parent = parent
	return part
end

local function buildMap()
	local old = workspace:FindFirstChild(MAP_NAME)
	if old then
		old:Destroy()
	end

	local map = Instance.new("Folder")
	map.Name = MAP_NAME

	local size = MapConfig.Size
	local height = MapConfig.WallHeight
	local thick = MapConfig.WallThickness
	local half = size / 2

	makePart(map, "Ground", Vector3.new(size, 2, size), Vector3.new(0, -1, 0), MapConfig.GroundColor)

	makePart(map, "WallNorth", Vector3.new(size, height, thick), Vector3.new(0, height / 2, -half), MapConfig.WallColor)
	makePart(map, "WallSouth", Vector3.new(size, height, thick), Vector3.new(0, height / 2, half), MapConfig.WallColor)
	makePart(map, "WallEast", Vector3.new(thick, height, size), Vector3.new(half, height / 2, 0), MapConfig.WallColor)
	makePart(map, "WallWest", Vector3.new(thick, height, size), Vector3.new(-half, height / 2, 0), MapConfig.WallColor)

	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "Spawn"
	spawn.Anchored = true
	spawn.Size = Vector3.new(12, 1, 12)
	spawn.Position = Vector3.new(0, 0.5, 0)
	spawn.Parent = map

	map.Parent = workspace
end

buildMap()
