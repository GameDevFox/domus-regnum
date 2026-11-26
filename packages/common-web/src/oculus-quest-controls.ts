import { Vector2, XRGripSpace, XRHandSpace, XRTargetRaySpace } from "three";

import { XRControllerModelFactory } from "three/examples/jsm/webxr/XRControllerModelFactory";
import { XRHandModelFactory } from "three/examples/jsm/webxr/XRHandModelFactory";

import { EventRouter } from "@kitsune/common";

import { lookup } from "./lookup";
import { OnChange } from "./on-change";

import { WebXRManager } from "three";

// TODO: Move this as it's not specific to Oculus Quest
export type ButtonEvent<T = any> = {
  pressed?: () => void,
  released?: () => void,
  whilePressed?: () => void,
  changed?: (value: T) => void,
}

// A button binding whose release masks by default. Pass only `pressed` and the
// `released` handler becomes a no-op — so while a higher layer owns this button, the
// release is consumed here instead of falling through to a lower layer's binding
// (e.g. an underlying push-to-talk). Pass `released` too to handle both edges.
// Saves every modifier-layer binding from remembering an explicit `released: () => {}`.
export const press = (
  pressed: () => void,
  released: () => void = () => {},
): ButtonEvent => ({ pressed, released });

// TODO: Finish this
type OculusQuestControllerRouter = {
  trigger?: ButtonEvent,
  grip?: ButtonEvent,
  thumbstick?: ButtonEvent,

  dir4?: {
    up?: any,
    down?: any,
    left?: any,
    right?: any,
  },

  a?: ButtonEvent,
  b?: ButtonEvent,
  menu?: ButtonEvent,
};

export type OculusQuestRootControlRouter = {
  controllers: {
    left?: OculusQuestControllerRouter,
    right?: OculusQuestControllerRouter,
  },
};

export interface Controls {
  controllers: XRTargetRaySpace[],
  controllerGrips: XRGripSpace[],
  hands: XRHandSpace[],
  getController: (
    handedness: XRHandedness,
    fn?: (controllerGrip: XRTargetRaySpace) => void
  ) => XRTargetRaySpace | undefined,
  getControllerGrip: (
    handedness: XRHandedness,
    fn?: (controllerGrip: XRGripSpace) => void
  ) => XRGripSpace | undefined,
  getGamepad: (
    handedness: XRHandedness,
    fn?: (gamepad: Gamepad, controller: XRTargetRaySpace) => void
  ) => Gamepad | undefined;
  update: () => void,
};

export interface UserData {
  gamepad: Gamepad,
  handedness: XRHandedness,

  onDir4: ReturnType<typeof OnChange<string>>,
  onButtons: ButtonsOnPress,
};

interface HasUserData {
  userData: Record<string, any>,
};

export const xrControllerModelFactory = new XRControllerModelFactory();
export const xrHandModelFactory = new XRHandModelFactory();

export const getUserData = (controller: HasUserData) => {
  if(!("userData" in controller))
    throw new Error("No `userData` property found.");

  return controller.userData as UserData;
}

const GetControllerFn = <T extends HasUserData>(controllers: T[]) => (handedness: XRHandedness, fn?: (controller: T) => void) => {
  const result = controllers.find(controllerGrip => {
    const userData = getUserData(controllerGrip);
    return userData.handedness === handedness
  });

  if(result && fn)
    fn(result);

  return result;
};

export const ControllerEventId = (
  userData: UserData, ...rest: string[]
) => ["controllers", userData.handedness, ...rest];

export const OculusQuestControls = (events: EventRouter, xr: WebXRManager): Controls => {

  // Event Triggers
  const controllers = [0, 1].map(index => {
    const controller = xr.getController(index);
    const userData = getUserData(controller);

    userData.onDir4 = OnChange<string>(value => {
      events.trigger(ControllerEventId(userData, "dir4", value.toLowerCase()));
    }, "NONE");

    const onButtons: ButtonsOnPress = {} as any;
    buttonNames.forEach(name => {
      const buttonEventId = (userData: UserData, ...rest: string[]) => ControllerEventId(userData, name, ...rest);

      onButtons[name] = OnChange<boolean>(value => {
        events.trigger(buttonEventId(userData, "changed"), value);

        const path = value ? "pressed" : "released";
        events.trigger(buttonEventId(userData, path));
      }, false);
    });
    userData.onButtons = onButtons;

    controller.addEventListener("connected", event => {
      const { gamepad, handedness, profiles } = event.data;

      userData.handedness = handedness;

      if(profiles[0] === "meta-quest-touch-plus" && gamepad !== undefined)
        userData.gamepad = gamepad;
    });

    return controller;
  });

  const controllerGrips = [0, 1].map(index => {
    const controllerGrip = xr.getControllerGrip(index);
    controllerGrip.addEventListener("connected", event => {
      const { data: xrInputSource } = event;
      const { handedness } = xrInputSource;

      const userData = getUserData(controllerGrip);
      userData.handedness = handedness;
    });

    const xrControllerModel = xrControllerModelFactory.createControllerModel(controllerGrip);
    controllerGrip.add(xrControllerModel);

    return controllerGrip;
  });

  const getController = GetControllerFn(controllers);
  const getControllerGrip = GetControllerFn(controllerGrips);
  const getGamepad = (
    handedness: XRHandedness,
    fn?: (gamepad: Gamepad, controller: XRTargetRaySpace) => void
  ) => {
    const controller = getController(handedness, controller => {
      const { gamepad } = getUserData(controller);

      if(gamepad && fn)
        fn(gamepad, controller);
    });

    if(!controller)
      return;

    const { gamepad } = getUserData(controller);

    return gamepad;
  };

  const hands = [0, 1].map(index => {
    const hand = xr.getHand(index);

    hand.add(xrHandModelFactory.createHandModel(hand, "mesh"));

    hand.addEventListener("connected", event => {
      const { data: xrInputSource } = event;
      const { handedness } = xrInputSource;

      // const { profiles } = xrInputSource;
      // log("CONNECTED hand", handedness, profiles);

      const userData = getUserData(hand);
      userData.handedness = handedness;
    });

    return hand;
  });

  const update = () => {
    controllers.forEach(controller => {
      const userData = getUserData(controller);
      const { gamepad, onDir4, onButtons } = userData;

      if(!gamepad)
        return;

      // Update dir4
      const dir4 = getDirFromGamepad(gamepad);
      onDir4.input(dir4);

      // Update buttons
      const buttons = getNamedButtons(gamepad.buttons);
      buttonNames.forEach(name => {
        const button = buttons[name];
        if(!button)
          return;

        const onChange = onButtons[name];
        onChange.input(button.pressed);
      });
    });
  };

  return {
    controllers, controllerGrips, hands, update,
    getController, getControllerGrip, getGamepad,
  }
};

interface Axis {
  x: number,
  y: number,
};

export const axisNames = (axes: readonly number[]) => ({
  touchpad: {
    x: axes[0] || 0,
    y: axes[1] || 0,
  },
  thumbstick: {
    x: axes[2] || 0,
    y: axes[3] || 0,
  },
});

export interface OculusQuestButtonMapped<T> {
  trigger: T,
  grip: T,
  touchpad: T,
  thumbstick: T,
  a: T,
  b: T,
  thumbRest: T,
  fingerCurl: T,
  fingerSlide: T,
  fingerProximity: T,
  thumbProximity: T,
  // ...
  menu: T,
}

type ButtonsOnPress = OculusQuestButtonMapped<ReturnType<typeof OnChange<boolean>>>;

export const leftAndRight: XRHandedness[] = ["left", "right"];

export const buttonNames: (keyof OculusQuestButtonMapped<GamepadButton>)[] = [
 "trigger", "grip", "touchpad", "thumbstick",
 "a", "b", "thumbRest", "fingerCurl", "fingerSlide",
 "fingerProximity", "thumbProximity", "menu",
];

export const getNamedButtons = (buttons: readonly GamepadButton[]) => {
  const namedButtons: OculusQuestButtonMapped<GamepadButton> = {
    trigger: buttons[0],
    grip: buttons[1],
    touchpad: buttons[2],
    thumbstick: buttons[3],
    a: buttons[4],
    b: buttons[5],
    thumbRest: buttons[6],
    fingerCurl: buttons[7],
    fingerSlide: buttons[8],
    fingerProximity: buttons[9],
    thumbProximity: buttons[10],
    // ...
    menu: buttons[12],
  };

  return namedButtons;
};

export const getAxis = (axes: readonly number[], index: number) => {
  const [x, y] = axes.slice(index * 2, index * 2 + 2);
  return { x, y } satisfies Axis;
};

export const axisToDirX = (a: number, b: number) => (axis: Axis) => {
  if(axis.x === 0 && axis.y === 0)
    return 0;

  const vec2 = new Vector2(axis.x, axis.y);
  let angle = vec2.angle();
  angle += (a * Math.PI / (b * 2)); // Rotate counter-clockwise by 90 + (b * 2) degrees
  angle = angle % (Math.PI * 2);
  const slice = angle / (Math.PI / b);
  return Math.floor(slice) + 1;
};

export const axisToDir4 = axisToDirX(3, 2);
export const axisToDir8 = axisToDirX(5, 4);

type Dir4 = "UP" | "DOWN" | "LEFT" | "RIGHT";

export const DIR_4: Record<Dir4, number> = {
  UP: 1,
  RIGHT: 2,
  DOWN: 3,
  LEFT: 4,
};

export const DIR_8 = {
  UP: 1,
  UP_RIGHT: 2,
  RIGHT: 3,
  DOWN_RIGHT: 4,
  DOWN: 5,
  DOWN_LEFT: 6,
  LEFT: 7,
  UP_LEFT: 8,
};

export const lookupDir4Name = (value: number) => lookup(DIR_4, value);
export const lookupDir8Name = (value: number) => lookup(DIR_8, value);

export const getDirFromGamepad = (gamepad: Gamepad, dirCount: (4 | 8) = 4) => {
  const axis = getAxis(gamepad.axes, 1);

  let result;
  if(dirCount === 4) {
    const dir4 = axisToDir4(axis);
    result = lookupDir4Name(dir4) ;
  } else {
    const dir8 = axisToDir8(axis);
    result = lookupDir8Name(dir8);
  }

  return result || "NONE";
};
