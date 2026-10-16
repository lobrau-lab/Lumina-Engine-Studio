import React, { useState, useEffect, useRef } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { 
  HelpCircle,
  Box, 
  Circle, 
  Play, 
  Square, 
  Layers, 
  Settings, 
  Code2, 
  Plus, 
  Trash2, 
  Eye, 
  EyeOff,
  Move,
  RotateCw,
  Maximize,
  Palette,
  ChevronRight,
  ChevronDown,
  Save,
  Download,
  Upload,
  Undo2,
  Redo2,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Editor } from '@monaco-editor/react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { GameObjectData, SceneData, Vector3 } from '@/src/engine/types';
import { EngineCore } from '@/src/engine/Core';
import { ScriptRunner } from '@/src/engine/ScriptRunner';

const DEFAULT_SCENE: SceneData = {
  objects: [
    {
      id: '1',
      name: 'Main Cube',
      type: 'cube',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: '#3b82f6',
      visible: true,
      script: 'self.rotation.y += 0.01;\nself.rotation.x += 0.005;'
    }
  ],
  ambientColor: '#ffffff',
  backgroundColor: '#111827'
};

export default function Studio() {
  const [scene, setScene] = useState<SceneData>(DEFAULT_SCENE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState('scene');
  
  const [logs, setLogs] = useState<{ msg: string; type: 'info' | 'error'; id: string }[]>([]);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  
  // History for Undo/Redo
  const [history, setHistory] = useState<SceneData[]>([DEFAULT_SCENE]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isInternalUpdate = useRef(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<EngineCore | null>(null);
  const scriptRunnerRef = useRef<ScriptRunner | null>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const textureInputRef = useRef<HTMLInputElement>(null);

  // Save to history
  const pushToHistory = (newScene: SceneData) => {
    if (isInternalUpdate.current) return;
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newScene)));
    // Limit history size
    if (newHistory.length > 50) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleImportModel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const ext = file.name.split('.').pop()?.toLowerCase();
    let type: 'gltf' | 'obj' | 'fbx' = 'gltf';
    if (ext === 'obj') type = 'obj';
    if (ext === 'fbx') type = 'fbx';
    if (ext === 'glb') type = 'gltf';
    
    const newObj: GameObjectData = {
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      type: 'model',
      modelUrl: url,
      modelType: type,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: '#ffffff',
      visible: true
    };
    const newScene = { ...scene, objects: [...scene.objects, newObj] };
    setScene(newScene);
    pushToHistory(newScene);
    setSelectedId(newObj.id);
    if (modelInputRef.current) modelInputRef.current.value = '';
  };

  const handleImportTexture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    const url = URL.createObjectURL(file);
    updateObject(selectedId, { textureUrl: url });
    if (textureInputRef.current) textureInputRef.current.value = '';
  };

  const undo = () => {
    if (historyIndex > 0) {
      isInternalUpdate.current = true;
      const prevScene = history[historyIndex - 1];
      setScene(JSON.parse(JSON.stringify(prevScene)));
      setHistoryIndex(historyIndex - 1);
      setTimeout(() => isInternalUpdate.current = false, 10);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      isInternalUpdate.current = true;
      const nextScene = history[historyIndex + 1];
      setScene(JSON.parse(JSON.stringify(nextScene)));
      setHistoryIndex(historyIndex + 1);
      setTimeout(() => isInternalUpdate.current = false, 10);
    }
  };

  const saveScene = () => {
    localStorage.setItem('lumina_scene', JSON.stringify(scene));
    setLogs(prev => [{ msg: 'Scene saved to local storage', type: 'info', id: Math.random().toString() }, ...prev]);
  };

  const loadScene = () => {
    const saved = localStorage.getItem('lumina_scene');
    if (saved) {
      const loadedScene = JSON.parse(saved);
      setScene(loadedScene);
      pushToHistory(loadedScene);
      setLogs(prev => [{ msg: 'Scene loaded from local storage', type: 'info', id: Math.random().toString() }, ...prev]);
    }
  };

  useEffect(() => {
    if (!scriptRunnerRef.current) {
      scriptRunnerRef.current = new ScriptRunner((msg, type) => {
        setLogs(prev => [{ msg, type, id: Math.random().toString() }, ...prev].slice(0, 50));
      });
    }
  }, []);

  // Use refs for mutable state accessed in callbacks to avoid recreating the engine
  const isPlayingRef = useRef(isPlaying);
  const sceneRef = useRef(scene);
  
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    sceneRef.current = scene;
    
    if (engineRef.current) {
      engineRef.current.setPlaying(isPlaying);
    }
  }, [isPlaying, scene]);

  useEffect(() => {
    if (viewportRef.current && !engineRef.current) {
      engineRef.current = new EngineCore(
        viewportRef.current, 
        (time, deltaTime) => {
          if (isPlayingRef.current) {
            sceneRef.current.objects.forEach(objData => {
              if (objData.script) {
                const threeObj = engineRef.current?.getObject(objData.id);
                if (threeObj) {
                  scriptRunnerRef.current?.run(objData.id, threeObj, time, deltaTime);
                }
              }
            });
          }
        },
        (id, updates) => {
          // Callback from TransformControls
          setScene(prev => {
            const newScene = {
              ...prev,
              objects: prev.objects.map(obj => obj.id === id ? { ...obj, ...updates } : obj)
            };
            return newScene;
          });
        },
        (id) => {
          // Callback from viewport selection
          setSelectedId(id);
        }
      );
      engineRef.current.start();
    }

    return () => {
      // Only dispose on unmount, not on every scene change
      // We handle this by not having dependencies in this useEffect
    };
  }, []); // Empty dependency array so it only runs once

  const selectedObject = scene.objects.find(obj => obj.id === selectedId);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.updateScene(scene);
      engineRef.current.selectObject(selectedId);
      engineRef.current.setTransformMode(transformMode);
      
      // Recompile scripts when they change
      scene.objects.forEach(obj => {
        if (obj.script) {
          scriptRunnerRef.current?.compile(obj.id, obj.script);
        }
      });
    }
  }, [scene, selectedId, transformMode]);

  const addObject = (type: GameObjectData['type']) => {
    const newObj: GameObjectData = {
      id: Math.random().toString(36).substr(2, 9),
      name: `New ${type.charAt(0).toUpperCase() + type.slice(1)}`,
      type,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: type === 'light' ? '#ffffff' : '#3b82f6',
      visible: true,
      intensity: type === 'light' ? 1 : undefined,
      physics: ['cube', 'sphere', 'plane'].includes(type) ? {
        enabled: false,
        mass: 1,
        type: type === 'plane' ? 'static' : 'dynamic',
        fixedRotation: false
      } : undefined,
      particles: type === 'particles' ? {
        type: 'fire',
        count: 1000,
        size: 0.1,
        speed: 1,
        spread: 1
      } : undefined
    };
    const newScene = { ...scene, objects: [...scene.objects, newObj] };
    setScene(newScene);
    pushToHistory(newScene);
    setSelectedId(newObj.id);
  };

  const applyTemplate = (name: string) => {
    let newScene: SceneData | null = null;
    if (name === 'bouncing-ball') {
      newScene = {
        objects: [
          {
            id: 'floor',
            name: 'Floor',
            type: 'plane',
            position: { x: 0, y: -2, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            color: '#1f2937',
            visible: true
          },
          {
            id: 'ball',
            name: 'Bouncing Ball',
            type: 'sphere',
            position: { x: 0, y: 2, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            color: '#ef4444',
            visible: true,
            script: 'self.position.y = Math.abs(Math.sin(time * 0.002) * 3) - 1.5;'
          }
        ],
        ambientColor: '#ffffff',
        backgroundColor: '#000000'
      };
    } else if (name === 'orbiting-cubes') {
      newScene = {
        objects: [
          {
            id: 'center',
            name: 'Sun',
            type: 'sphere',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            color: '#fbbf24',
            visible: true
          },
          {
            id: 'cube1',
            name: 'Planet 1',
            type: 'cube',
            position: { x: 3, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 0.5, y: 0.5, z: 0.5 },
            color: '#3b82f6',
            visible: true,
            script: 'self.position.x = Math.cos(time * 0.001) * 3;\nself.position.z = Math.sin(time * 0.001) * 3;\nself.rotation.y += 0.02;'
          },
          {
            id: 'cube2',
            name: 'Planet 2',
            type: 'cube',
            position: { x: -5, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 0.7, y: 0.7, z: 0.7 },
            color: '#10b981',
            visible: true,
            script: 'self.position.x = Math.cos(time * 0.0005 + Math.PI) * 5;\nself.position.z = Math.sin(time * 0.0005 + Math.PI) * 5;\nself.rotation.x += 0.01;'
          }
        ],
        ambientColor: '#ffffff',
        backgroundColor: '#020617'
      };
    } else if (name === 'physics-playground') {
      newScene = {
        objects: [
          {
            id: 'floor',
            name: 'Floor',
            type: 'plane',
            position: { x: 0, y: -2, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 10, y: 10, z: 1 },
            color: '#1f2937',
            visible: true,
            physics: { enabled: true, mass: 0, type: 'static', fixedRotation: false }
          },
          {
            id: 'box1',
            name: 'Box 1',
            type: 'cube',
            position: { x: 0, y: 5, z: 0 },
            rotation: { x: 0.5, y: 0.5, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            color: '#3b82f6',
            visible: true,
            physics: { enabled: true, mass: 1, type: 'dynamic', fixedRotation: false }
          },
          {
            id: 'box2',
            name: 'Box 2',
            type: 'cube',
            position: { x: 0.2, y: 8, z: 0.1 },
            rotation: { x: 0, y: 0.2, z: 0.1 },
            scale: { x: 1, y: 1, z: 1 },
            color: '#ef4444',
            visible: true,
            physics: { enabled: true, mass: 1, type: 'dynamic', fixedRotation: false }
          },
          {
            id: 'sphere1',
            name: 'Ball',
            type: 'sphere',
            position: { x: -0.5, y: 12, z: -0.2 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            color: '#10b981',
            visible: true,
            physics: { enabled: true, mass: 2, type: 'dynamic', fixedRotation: false }
          }
        ],
        ambientColor: '#ffffff',
        backgroundColor: '#111827'
      };
    }
    if (newScene) {
      setScene(newScene);
      pushToHistory(newScene);
    }
  };

  const updateObject = (id: string, updates: Partial<GameObjectData>) => {
    const newScene = {
      ...scene,
      objects: scene.objects.map(obj => obj.id === id ? { ...obj, ...updates } : obj)
    };
    setScene(newScene);
    // Debounce history push for some properties like position/rotation if needed
    // For now simple push
    pushToHistory(newScene);
  };

  const deleteObject = (id: string) => {
    const newScene = {
      ...scene,
      objects: scene.objects.filter(obj => obj.id !== id)
    };
    setScene(newScene);
    pushToHistory(newScene);
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className="flex h-screen w-full bg-[#09090b] text-zinc-100 overflow-hidden font-sans">
      <input type="file" ref={modelInputRef} className="hidden" accept=".gltf,.glb,.obj,.fbx" onChange={handleImportModel} />
      <input type="file" ref={textureInputRef} className="hidden" accept="image/*" onChange={handleImportTexture} />
      {/* Sidebar - Hierarchy */}
      <div className="w-64 border-r border-zinc-800 flex flex-col bg-[#09090b]">
        <div className="p-4 flex items-center justify-between border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
              <Layers className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold tracking-tight">Hierarchy</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger render={(props) => (
              <Button {...props} variant="ghost" size="icon" className="h-8 w-8">
                <Plus className="w-4 h-4" />
              </Button>
            )} />
            <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 text-zinc-100">
              <DropdownMenuItem onClick={() => addObject('cube')} className="gap-2"><Box className="w-4 h-4" /> Cube</DropdownMenuItem>
              <DropdownMenuItem onClick={() => addObject('sphere')} className="gap-2"><Circle className="w-4 h-4" /> Sphere</DropdownMenuItem>
              <DropdownMenuItem onClick={() => addObject('plane')} className="gap-2"><Square className="w-4 h-4" /> Plane</DropdownMenuItem>
              <DropdownMenuItem onClick={() => addObject('light')} className="gap-2"><Settings className="w-4 h-4" /> Light</DropdownMenuItem>
              <DropdownMenuItem onClick={() => addObject('sprite')} className="gap-2"><Circle className="w-4 h-4 fill-current" /> Sprite (2D)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => addObject('particles')} className="gap-2"><Sparkles className="w-4 h-4" /> Particles</DropdownMenuItem>
              <DropdownMenuItem onClick={() => modelInputRef.current?.click()} className="gap-2"><Upload className="w-4 h-4" /> Import Model</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {scene.objects.map(obj => (
              <div
                key={obj.id}
                onClick={() => setSelectedId(obj.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors ${
                  selectedId === obj.id ? 'bg-zinc-800 text-white' : 'hover:bg-zinc-900 text-zinc-400'
                }`}
              >
                {obj.type === 'cube' && <Box className="w-4 h-4" />}
                {obj.type === 'sphere' && <Circle className="w-4 h-4" />}
                {obj.type === 'plane' && <Square className="w-4 h-4" />}
                {obj.type === 'light' && <Settings className="w-4 h-4" />}
                {obj.type === 'sprite' && <Circle className="w-4 h-4 fill-current" />}
                {obj.type === 'particles' && <Sparkles className="w-4 h-4" />}
                {obj.type === 'model' && <Box className="w-4 h-4" />}
                <span className="text-sm truncate flex-1">{obj.name}</span>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    updateObject(obj.id, { visible: !obj.visible });
                  }}
                  className="opacity-50 hover:opacity-100"
                >
                  {obj.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="h-14 border-b border-zinc-800 flex items-center justify-between px-4 bg-[#09090b]">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-zinc-900 rounded-lg p-1">
              <Button 
                variant={isPlaying ? "default" : "ghost"} 
                size="sm" 
                className={`h-8 gap-2 ${isPlaying ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                onClick={() => setIsPlaying(!isPlaying)}
              >
                <Play className={`w-4 h-4 ${isPlaying ? 'fill-current' : ''}`} />
                {isPlaying ? 'Stop' : 'Play'}
              </Button>
            </div>
            
            <Separator orientation="vertical" className="h-6 bg-zinc-800" />

            <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-1">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-zinc-400 hover:text-white"
                onClick={undo}
                disabled={historyIndex === 0}
              >
                <Undo2 className="w-4 h-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-zinc-400 hover:text-white"
                onClick={redo}
                disabled={historyIndex === history.length - 1}
              >
                <Redo2 className="w-4 h-4" />
              </Button>
            </div>
            
            <Separator orientation="vertical" className="h-6 bg-zinc-800" />
            
            <DropdownMenu>
              <DropdownMenuTrigger render={(props) => (
                <Button {...props} variant="ghost" size="sm" className="h-8 gap-2 text-zinc-400 hover:text-white">
                  Templates
                  <ChevronDown className="w-3 h-3" />
                </Button>
              )} />
              <DropdownMenuContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                <DropdownMenuItem onClick={() => applyTemplate('bouncing-ball')}>Bouncing Ball</DropdownMenuItem>
                <DropdownMenuItem onClick={() => applyTemplate('orbiting-cubes')}>Orbiting Cubes</DropdownMenuItem>
                <DropdownMenuItem onClick={() => applyTemplate('physics-playground')}>Physics Playground</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <Separator orientation="vertical" className="h-6 bg-zinc-800" />
            
            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white" onClick={() => engineRef.current?.exportScene()} title="Export Scene to GLTF">
              <Download className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            <Dialog>
              <DialogTrigger render={(props) => (
                <Button {...props} variant="ghost" size="sm" className="h-8 gap-2 text-zinc-400 hover:text-white">
                  <HelpCircle className="w-4 h-4" />
                  Help
                </Button>
              )} />
              <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold text-white">Welcome to Lumina Engine Studio</DialogTitle>
                  <DialogDescription className="text-zinc-400">
                    A simple yet powerful environment for creating 3D and 2D experiences.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h4 className="font-semibold text-blue-400">1. Build</h4>
                      <p className="text-sm text-zinc-400">Add objects using the <Plus className="w-3 h-3 inline" /> button in the Hierarchy. Move, rotate, and scale them in the Inspector.</p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-semibold text-green-400">2. Script</h4>
                      <p className="text-sm text-zinc-400">Switch to the Script Editor tab to add behavior. Use simple JavaScript to animate your objects.</p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-semibold text-purple-400">3. Play</h4>
                      <p className="text-sm text-zinc-400">Press the <Play className="w-3 h-3 inline" /> Play button to see your scripts in action. Check the Console for errors.</p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-semibold text-orange-400">4. Templates</h4>
                      <p className="text-sm text-zinc-400">Use the Templates menu to quickly load pre-built scenes and learn how they work.</p>
                    </div>
                  </div>
                  <Separator className="bg-zinc-800" />
                  <div className="bg-zinc-950 p-4 rounded-md font-mono text-xs text-zinc-500">
                    <div className="text-zinc-300 mb-2">// Example Script</div>
                    <div>self.rotation.y += 0.01;</div>
                    <div>self.position.x = Math.sin(time * 0.001) * 2;</div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="ghost" size="sm" className="h-8 gap-2 text-zinc-400 hover:text-white" onClick={saveScene}>
              <Save className="w-4 h-4" />
              Save
            </Button>
            <Button variant="ghost" size="sm" className="h-8 gap-2 text-zinc-400 hover:text-white" onClick={loadScene}>
              <Upload className="w-4 h-4" />
              Load
            </Button>
          </div>
        </div>

        {/* Viewport / Editor Area */}
        <div className="flex-1 flex flex-col relative">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <div className="px-4 border-b border-zinc-800 bg-[#09090b]">
              <TabsList className="bg-transparent h-10 p-0 gap-4">
                <TabsTrigger 
                  value="scene" 
                  className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none h-10 px-0 text-zinc-400 data-[state=active]:text-white"
                >
                  Scene View
                </TabsTrigger>
                <TabsTrigger 
                  value="script" 
                  className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none h-10 px-0 text-zinc-400 data-[state=active]:text-white"
                >
                  Script Editor
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="scene" className="flex-1 m-0 p-0 relative bg-[#09090b]">
              <div ref={viewportRef} className="w-full h-full" />
              {/* Overlay Controls */}
              <div className="absolute top-4 left-4 flex flex-col gap-2">
                <Card className="bg-zinc-900/80 backdrop-blur border-zinc-800 p-1 flex flex-col gap-1">
                  <Button 
                    variant={transformMode === 'translate' ? 'default' : 'ghost'} 
                    size="icon" 
                    className={`h-8 w-8 ${transformMode === 'translate' ? 'bg-blue-600' : 'text-zinc-400 hover:text-white'}`}
                    onClick={() => setTransformMode('translate')}
                  >
                    <Move className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant={transformMode === 'rotate' ? 'default' : 'ghost'} 
                    size="icon" 
                    className={`h-8 w-8 ${transformMode === 'rotate' ? 'bg-blue-600' : 'text-zinc-400 hover:text-white'}`}
                    onClick={() => setTransformMode('rotate')}
                  >
                    <RotateCw className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant={transformMode === 'scale' ? 'default' : 'ghost'} 
                    size="icon" 
                    className={`h-8 w-8 ${transformMode === 'scale' ? 'bg-blue-600' : 'text-zinc-400 hover:text-white'}`}
                    onClick={() => setTransformMode('scale')}
                  >
                    <Maximize className="w-4 h-4" />
                  </Button>
                </Card>
              </div>
              
              <div className="absolute bottom-4 left-4">
                <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-md px-3 py-1.5 text-[10px] text-zinc-400 flex items-center gap-4">
                  <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-zinc-600" /> Left Click: Orbit</div>
                  <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-zinc-600" /> Right Click: Pan</div>
                  <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-zinc-600" /> Scroll: Zoom</div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="script" className="flex-1 m-0 p-0 bg-[#1e1e1e]">
              {selectedObject ? (
                <Editor
                  height="100%"
                  defaultLanguage="javascript"
                  theme="vs-dark"
                  value={selectedObject.script || ''}
                  onChange={(val) => updateObject(selectedObject.id, { script: val })}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    padding: { top: 20 },
                    scrollBeyondLastLine: false,
                  }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-6 p-8 text-center">
                  <div className="flex flex-col items-center gap-4">
                    <Code2 className="w-12 h-12 opacity-20" />
                    <p>Select an object to edit its script</p>
                  </div>
                  <div className="max-w-md bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 text-left">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Scripting API</h4>
                    <ul className="text-xs space-y-2 list-disc list-inside opacity-70">
                      <li><code className="text-blue-400">self</code>: The current object (Three.js Object3D)</li>
                      <li><code className="text-blue-400">time</code>: Total elapsed time in ms</li>
                      <li><code className="text-blue-400">THREE</code>: The Three.js library</li>
                      <li><code className="text-blue-400">log(msg, type)</code>: Log to console</li>
                      <li>Example: <code className="text-zinc-300">self.rotation.y += 0.01;</code></li>
                    </ul>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Console */}
          <div className="h-32 border-t border-zinc-800 bg-[#09090b] flex flex-col">
            <div className="px-4 py-1 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Console</span>
              <Button variant="ghost" size="sm" className="h-5 text-[10px] text-zinc-500" onClick={() => setLogs([])}>Clear</Button>
            </div>
            <ScrollArea className="flex-1 p-2">
              <div className="space-y-1">
                {logs.map(log => (
                  <div key={log.id} className={`text-xs font-mono ${log.type === 'error' ? 'text-red-400' : 'text-zinc-400'}`}>
                    <span className="opacity-50 mr-2">[{new Date().toLocaleTimeString()}]</span>
                    {log.msg}
                  </div>
                ))}
                {logs.length === 0 && <div className="text-xs text-zinc-600 italic">No logs yet...</div>}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Inspector */}
      <div className="w-80 border-l border-zinc-800 flex flex-col bg-[#09090b]">
        <div className="p-4 flex items-center gap-2 border-b border-zinc-800">
          <Settings className="w-4 h-4 text-zinc-400" />
          <span className="font-semibold tracking-tight">Inspector</span>
        </div>
        
        <ScrollArea className="flex-1">
          {selectedObject ? (
            <div className="p-4 space-y-6">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-zinc-500">Identity</Label>
                <div className="grid gap-4">
                  <div className="grid gap-1.5">
                    <Label htmlFor="name" className="text-zinc-400">Name</Label>
                    <Input 
                      id="name" 
                      value={selectedObject.name} 
                      onChange={(e) => updateObject(selectedObject.id, { name: e.target.value })}
                      className="bg-zinc-900 border-zinc-800 h-8"
                    />
                  </div>
                </div>
              </div>

              <Separator className="bg-zinc-800" />

              <div className="space-y-4">
                <Label className="text-xs uppercase tracking-wider text-zinc-500">Transform</Label>
                
                <div className="space-y-3">
                  <Label className="text-zinc-400 flex items-center gap-2"><Move className="w-3 h-3" /> Position</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {['x', 'y', 'z'].map((axis) => (
                      <div key={axis} className="flex items-center gap-1">
                        <span className="text-[10px] text-zinc-600 uppercase">{axis}</span>
                        <Input 
                          type="number" 
                          step="0.1"
                          value={selectedObject.position[axis as keyof Vector3]}
                          onChange={(e) => updateObject(selectedObject.id, { 
                            position: { ...selectedObject.position, [axis]: parseFloat(e.target.value) || 0 } 
                          })}
                          className="bg-zinc-900 border-zinc-800 h-7 px-1 text-center text-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-zinc-400 flex items-center gap-2"><RotateCw className="w-3 h-3" /> Rotation</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {['x', 'y', 'z'].map((axis) => (
                      <div key={axis} className="flex items-center gap-1">
                        <span className="text-[10px] text-zinc-600 uppercase">{axis}</span>
                        <Input 
                          type="number" 
                          step="0.1"
                          value={selectedObject.rotation[axis as keyof Vector3]}
                          onChange={(e) => updateObject(selectedObject.id, { 
                            rotation: { ...selectedObject.rotation, [axis]: parseFloat(e.target.value) || 0 } 
                          })}
                          className="bg-zinc-900 border-zinc-800 h-7 px-1 text-center text-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-zinc-400 flex items-center gap-2"><Maximize className="w-3 h-3" /> Scale</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {['x', 'y', 'z'].map((axis) => (
                      <div key={axis} className="flex items-center gap-1">
                        <span className="text-[10px] text-zinc-600 uppercase">{axis}</span>
                        <Input 
                          type="number" 
                          step="0.1"
                          value={selectedObject.scale[axis as keyof Vector3]}
                          onChange={(e) => updateObject(selectedObject.id, { 
                            scale: { ...selectedObject.scale, [axis]: parseFloat(e.target.value) || 0 } 
                          })}
                          className="bg-zinc-900 border-zinc-800 h-7 px-1 text-center text-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <Separator className="bg-zinc-800" />

              <div className="space-y-4">
                <Label className="text-xs uppercase tracking-wider text-zinc-500">Material</Label>
                <div className="flex items-center justify-between">
                  <Label className="text-zinc-400 flex items-center gap-2"><Palette className="w-3 h-3" /> Color</Label>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-6 h-6 rounded border border-zinc-700 cursor-pointer" 
                      style={{ backgroundColor: selectedObject.color }}
                    />
                    <Input 
                      type="text" 
                      value={selectedObject.color}
                      onChange={(e) => updateObject(selectedObject.id, { color: e.target.value })}
                      className="bg-zinc-900 border-zinc-800 h-8 w-24 text-xs"
                    />
                  </div>
                </div>
                {selectedObject.type === 'light' && (
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Intensity</Label>
                    <Slider 
                      value={[selectedObject.intensity || 1]} 
                      min={0} 
                      max={5} 
                      step={0.1}
                      onValueChange={(val: any) => {
                        const v = Array.isArray(val) ? val[0] : val;
                        updateObject(selectedObject.id, { intensity: v });
                      }}
                    />
                  </div>
                )}
              </div>

              {['cube', 'sphere', 'plane'].includes(selectedObject.type) && (
                <>
                  <Separator className="bg-zinc-800" />
                  <div className="space-y-4">
                    <Label className="text-xs uppercase tracking-wider text-zinc-500">Material</Label>
                    <div className="space-y-2">
                      <Label className="text-zinc-400">Texture</Label>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="w-full bg-zinc-900 border-zinc-800" onClick={() => textureInputRef.current?.click()}>
                          <Upload className="w-4 h-4 mr-2" />
                          {selectedObject.textureUrl ? 'Change Texture' : 'Upload Texture'}
                        </Button>
                        {selectedObject.textureUrl && (
                          <Button variant="outline" size="sm" className="bg-zinc-900 border-zinc-800 px-2" onClick={() => updateObject(selectedObject.id, { textureUrl: undefined })}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <Separator className="bg-zinc-800" />
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs uppercase tracking-wider text-zinc-500">Physics</Label>
                      <Switch 
                        checked={selectedObject.physics?.enabled || false}
                        onCheckedChange={(checked) => updateObject(selectedObject.id, { 
                          physics: { ...selectedObject.physics, enabled: checked, mass: selectedObject.physics?.mass || 1, type: selectedObject.physics?.type || 'dynamic', fixedRotation: selectedObject.physics?.fixedRotation || false } 
                        })}
                      />
                    </div>
                    
                    {selectedObject.physics?.enabled && (
                      <div className="space-y-4 pt-2">
                        <div className="space-y-2">
                          <Label className="text-zinc-400">Body Type</Label>
                          <Select 
                            value={selectedObject.physics.type} 
                            onValueChange={(val: any) => updateObject(selectedObject.id, { physics: { ...selectedObject.physics!, type: val } })}
                          >
                            <SelectTrigger className="h-8 bg-zinc-900 border-zinc-800 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                              <SelectItem value="dynamic">Dynamic (Moves)</SelectItem>
                              <SelectItem value="static">Static (Fixed)</SelectItem>
                              <SelectItem value="kinematic">Kinematic (Scripted)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {selectedObject.physics.type === 'dynamic' && (
                          <div className="space-y-2">
                            <Label className="text-zinc-400">Mass</Label>
                            <Input 
                              type="number" 
                              step="0.1"
                              value={selectedObject.physics.mass}
                              onChange={(e) => updateObject(selectedObject.id, { physics: { ...selectedObject.physics!, mass: parseFloat(e.target.value) || 0 } })}
                              className="bg-zinc-900 border-zinc-800 h-8 text-xs"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              {selectedObject.type === 'particles' && selectedObject.particles && (
                <>
                  <Separator className="bg-zinc-800" />
                  <div className="space-y-4">
                    <Label className="text-xs uppercase tracking-wider text-zinc-500">Particle System</Label>
                    
                    <div className="space-y-2">
                      <Label className="text-zinc-400">Effect Type</Label>
                      <Select 
                        value={selectedObject.particles.type} 
                        onValueChange={(val: any) => updateObject(selectedObject.id, { particles: { ...selectedObject.particles!, type: val } })}
                      >
                        <SelectTrigger className="h-8 bg-zinc-900 border-zinc-800 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                          <SelectItem value="fire">Fire</SelectItem>
                          <SelectItem value="smoke">Smoke</SelectItem>
                          <SelectItem value="sparks">Sparks</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-zinc-400">Count ({selectedObject.particles.count})</Label>
                      <Slider 
                        value={[selectedObject.particles.count]} 
                        min={10} 
                        max={5000} 
                        step={10}
                        onValueChange={(val: any) => {
                          const v = Array.isArray(val) ? val[0] : val;
                          updateObject(selectedObject.id, { particles: { ...selectedObject.particles!, count: v } });
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-zinc-400">Size</Label>
                      <Slider 
                        value={[selectedObject.particles.size]} 
                        min={0.01} 
                        max={1} 
                        step={0.01}
                        onValueChange={(val: any) => {
                          const v = Array.isArray(val) ? val[0] : val;
                          updateObject(selectedObject.id, { particles: { ...selectedObject.particles!, size: v } });
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-zinc-400">Speed</Label>
                      <Slider 
                        value={[selectedObject.particles.speed]} 
                        min={0.1} 
                        max={10} 
                        step={0.1}
                        onValueChange={(val: any) => {
                          const v = Array.isArray(val) ? val[0] : val;
                          updateObject(selectedObject.id, { particles: { ...selectedObject.particles!, speed: v } });
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-zinc-400">Spread</Label>
                      <Slider 
                        value={[selectedObject.particles.spread]} 
                        min={0} 
                        max={5} 
                        step={0.1}
                        onValueChange={(val: any) => {
                          const v = Array.isArray(val) ? val[0] : val;
                          updateObject(selectedObject.id, { particles: { ...selectedObject.particles!, spread: v } });
                        }}
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="pt-4">
                <Button 
                  variant="destructive" 
                  size="sm" 
                  className="w-full gap-2"
                  onClick={() => deleteObject(selectedObject.id)}
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Object
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-6">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-zinc-500">Scene Settings</Label>
                <div className="grid gap-4">
                  <div className="grid gap-1.5">
                    <Label className="text-zinc-400">Background Color</Label>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-6 h-6 rounded border border-zinc-700 cursor-pointer" 
                        style={{ backgroundColor: scene.backgroundColor }}
                      />
                      <Input 
                        type="text" 
                        value={scene.backgroundColor}
                        onChange={(e) => setScene(prev => ({ ...prev, backgroundColor: e.target.value }))}
                        className="bg-zinc-900 border-zinc-800 h-8 text-xs"
                      />
                    </div>
                  </div>
                  
                  <div className="grid gap-1.5">
                    <Label className="text-zinc-400">Shadow Quality</Label>
                    <Select 
                      value={scene.shadowQuality || 'off'} 
                      onValueChange={(val: any) => setScene(prev => ({ ...prev, shadowQuality: val }))}
                    >
                      <SelectTrigger className="h-8 bg-zinc-900 border-zinc-800 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                        <SelectItem value="off">Off</SelectItem>
                        <SelectItem value="low">Low (1024x1024)</SelectItem>
                        <SelectItem value="medium">Medium (2048x2048)</SelectItem>
                        <SelectItem value="high">High (4096x4096)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col items-center justify-center pt-12 text-zinc-500 p-8 text-center gap-4">
                <Settings className="w-12 h-12 opacity-20" />
                <p className="text-sm">Select an object in the hierarchy to view its properties, or adjust scene settings above.</p>
              </div>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
