import * as THREE from 'three';

export type Vector3 = { x: number; y: number; z: number };

export type GameObjectData = {
  id: string;
  name: string;
  type: 'cube' | 'sphere' | 'plane' | 'light' | 'sprite' | 'particles' | 'model';
  position: Vector3;
  rotation: Vector3;
  scale: Vector3;
  color: string;
  visible: boolean;
  script?: string;
  intensity?: number; // For lights
  physics?: {
    enabled: boolean;
    mass: number;
    type: 'dynamic' | 'static' | 'kinematic';
    fixedRotation: boolean;
  };
  particles?: {
    type: 'fire' | 'smoke' | 'sparks';
    count: number;
    size: number;
    speed: number;
    spread: number;
  };
  modelUrl?: string;
  modelType?: 'gltf' | 'obj' | 'fbx';
  textureUrl?: string;
};

export interface SceneData {
  objects: GameObjectData[];
  ambientColor: string;
  backgroundColor: string;
  shadowQuality?: 'off' | 'low' | 'medium' | 'high';
}

export interface EngineState {
  isPlaying: boolean;
  selectedObjectId: string | null;
}
