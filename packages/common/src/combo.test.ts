import { byCombo, Combo, generateCombo, shortenCombos } from "./combo";
import { idToBase64, base64ToId } from "./id";

// We're using fake values for these Ids so that if we need to change the
// actual ids this test doesn't break
const ARGUMENT_MAPPED_FN = base64ToId("FqJWYy8PtdCEHvbhL7nvMZOHTYurCAHQ39SWrgRnOZ8");
const ARGUMENT_MAPPING = base64ToId("qShrYWve0L24RoE0Na_0bFipN_2Dc3i58eeaU2v_yT0");
const DESCRIPTION = base64ToId("KTYzBZ6M9clLuK1ZAxpseWjceQ84_2XaHmSkLtYJMVo");
const EASY_LIST_HEADS = base64ToId("AlwjmoP7qFVGRjFeJyArtgJ1mSs3fd2gzeEYKu7h6cw");
const EASY_LIST_TAILS = base64ToId("dKUcmTlYKh9fX7C1AttH99ZrzijDAfdM1_ISEVH1g3I");
const EASY_LOOKUP_NAME = base64ToId("eU06S5mE9mF-zuUbAhCJDgbozqaLR67EsL4PN8caXnQ");
const EASY_NAME_ID = base64ToId("8un5NguR-SxfuP9AD4WnQ-6OrqWfrTZYbJV11xsbXbQ");
const EASY_RESOLVE_STRING = base64ToId("nRxTuYrm7mBzvOXKCeksX-aBgBbZCkiC3S0EmIgAflk");
const EDGE = base64ToId("2Icl8_ZdpumJz4m-waj2lJ3yHnq_AZwCG6WnKBiJ1D4");
const FN_ADD_EDGE = base64ToId("xvHOCpV46kV_IHlm4gYI9fQLATJrfJFh-WMNAVsfotU");
const FN_BUILD_ARG_MAPPER = base64ToId("yoGDEKU8ivUVqhGMvBq0CjzttDatn2NJ3mXPOSbyRkY");
const FN_BUILD_ARG_MAPPING = base64ToId("gK9b0Uw1KKRuj8Zj1q1vqUljZaAzk6nb1gQm6eSz1fU");
const FN_BUILD_MAP_ARGS_FN = base64ToId("jmmBCviwxv04px85b04qAAorgHzeBDwjYZPTYDbHm2o");
const FN_IDENTITY = base64ToId("FuIlMwPR_ldnFPm774QKHD5UaAX6Z0FRg3tMJvzRwK0");
const RESOLVE_SET = base64ToId("F2qcAHPaFGSLUvOFpnqxv4tA29061rNTih8H13KD6ks");
const FN_MAP_VALUES_TO_STRINGS = base64ToId("ipaaYyb0l5l3GukhkjnawwFd-5GM_H42YxN9GLk-jYw");
const FN_NEW_ID = base64ToId("5-CfjMS-_-IVoa24hlxIjcIocI8Mxls4dEuZkF5iZ1A");
const FN_RESOLVE_MAP = base64ToId("5-soMAS2fI7OXzUg9SjF1hkeTVrW5kY_WJlfdK_ixWE");
const FN_STRING_TO_ID = base64ToId("Chnnv1dP8PoPMvx3DIEr2fpmNRd9v5vY4FwFZ1lYo6I");
const FUNCTION = base64ToId("3thCfRLyIKc06sq-ekcFn21jvn7iArO3GPSAZCUpjBQ");
const GRAPH = base64ToId("eirsu3-YNKSYRkBVjv4iGofi5Ify0onjmW3rz8ELIDM");
const HEAD = base64ToId("0myE2K0uq6l3Ij4ZOcM2OKZ-yDfCh8lguXgRZiSfb9I");
const ID = base64ToId("lvvIbUbLeqHeV2FobsJ-ylupa0gfuBUBM9flSxrsCII");
const LIST = base64ToId("run45uPkLFB17xfldQMdMLr55RowFOVdr0sELKwc0DI");
const MAIN = base64ToId("wyw9964f188YmOjiigVHMUqJSv0_XJ0P-l5YmsHNBbo");
const MAP = base64ToId("W9fdCCyei4xlXdvpJ5-0XhUfwEAfssGooVIJnJLfBNE");
const NAME = base64ToId("yqdDc3mLsAhVzxC_XVf0HPeqwciPmCUdn7u7sE05crc");
const NEXT = base64ToId("opU70gtVDvJ-_rOils5nDS3YdPNY-vgCMsFaBI3PgFY");
const NODE = base64ToId("glp9kwrPA6sd9GIsbw3i0hSvGCn2CdWX9_Ve5EIVF9s");
const NODE_IDS = base64ToId("FWfQlaFpYGaDAxGZ8Wc6-MKMR2xpr0PNswhC2nDa_b8");
const PRIMARY_INPUT = base64ToId("e2LO-q9jIQPMU5kCo_iCjtSVbPpmglPRd62mdACpytc");
const SET = base64ToId("wpFxoukI3y42KmRVMMfN3TJpny5leqYD97_QWpHN_d8");
const STRING = base64ToId("SQsafNS1INJ2l1BFvLO80Ti4tOlmg-5HjRXa_M-QWxE");
const TAIL = base64ToId("iFCHvRkXwAKC_nCn52WAIYycj90qO_ubP_jcibnTyN8");
const Z_ARGS_BY_ID = base64ToId("EzPKYmm4Oj_90_pI5AzpDgyzDSZ5F_2udxp62hqzRKo");
const Z_BUILD_GREET = base64ToId("lAXFCpUli67Ct6EN9aE2jl8oj9fYymRfJ4UO1gGg7hs");
const Z_MY_NAME = base64ToId("HkKZy0Jkso4TT4-6dDQsgl-fDIO2gE8-jK0MzoAidN4");
const Z_NEW_IDS = base64ToId("y9v_I_91Mea-bJRgSdh9zSLBclzUWKSGAGuNqSmEURU");
const Z_YOUR_NAME = base64ToId("IaaVe4ZMmlcpsaZrJQHxVmqgThOMXtLfYgwfCBbdi3E");

const testIds = {
  ARGUMENT_MAPPED_FN, ARGUMENT_MAPPING, DESCRIPTION, EASY_LIST_HEADS, EASY_LIST_TAILS,
  EASY_LOOKUP_NAME, EASY_NAME_ID, EASY_RESOLVE_STRING, EDGE, FN_ADD_EDGE, FN_BUILD_ARG_MAPPER,
  FN_BUILD_ARG_MAPPING, FN_BUILD_MAP_ARGS_FN, FN_IDENTITY, RESOLVE_SET, FN_MAP_VALUES_TO_STRINGS,
  FN_NEW_ID, FN_RESOLVE_MAP, FN_STRING_TO_ID, FUNCTION, GRAPH, HEAD, ID, LIST, MAIN, MAP, NAME,
  NEXT, NODE, NODE_IDS, PRIMARY_INPUT, SET, STRING, TAIL, Z_ARGS_BY_ID, Z_BUILD_GREET, Z_MY_NAME,
  Z_NEW_IDS, Z_YOUR_NAME,
};

describe("generateCombo", () => {
  it("should work", () => {
    const combo = generateCombo(idToBase64(HEAD), 7);
    expect(combo).toEqual([
      1, 6, 3, 1, 5, 4, 1, 0, 2, 5, 0, 4, 2, 0, 5, 6, 1, 4, 5, 5, 2, 0, 3,
      4, 1, 5, 6, 5, 1, 0, 3, 2, 1, 3, 2, 4, 4, 1, 2, 6, 4, 5, 3, 6, 6, 6,
      6, 1, 2, 0, 6, 5, 1, 1, 0, 2, 6, 5, 0, 4, 2, 4, 3, 1, 4, 4, 4, 6, 5,
      5, 5, 3, 1, 3, 2, 4, 5, 3, 5, 2, 6, 6, 6, 2, 2, 2, 0, 2, 1, 2, 1, 1,
    ]);
  });
});

describe("shortenCombos", () => {
  it("should work", () => {
    const combos: Record<string, Combo> = Object.fromEntries(
      Object.values(testIds).map(nodeId => [idToBase64(nodeId), generateCombo(idToBase64(nodeId), 8)])
    );
    const { combos: shortCombos, getKey } = shortenCombos(combos);

    expect(shortCombos).toEqual({
      [idToBase64(FN_NEW_ID)]: [0],
      [idToBase64(FN_RESOLVE_MAP)]: [1, 4],
      [idToBase64(EASY_RESOLVE_STRING)]: [1, 3],
      [idToBase64(Z_YOUR_NAME)]: [1, 6],
      [idToBase64(MAP)]: [1, 2, 3],
      [idToBase64(STRING)]: [1, 2, 4],
      [idToBase64(ID)]: [2, 0],
      [idToBase64(HEAD)]: [2, 2],
      [idToBase64(DESCRIPTION)]: [2, 3],
      [idToBase64(FN_STRING_TO_ID)]: [2, 4],
      [idToBase64(Z_ARGS_BY_ID)]: [2, 5, 2],
      [idToBase64(FN_BUILD_MAP_ARGS_FN)]: [2, 5, 5],
      [idToBase64(LIST)]: [2, 6, 0],
      [idToBase64(EASY_LIST_TAILS)]: [2, 6, 5],
      [idToBase64(MAIN)]: [2, 7],
      [idToBase64(RESOLVE_SET)]: [3, 1],
      [idToBase64(Z_BUILD_GREET)]: [3, 3, 0],
      [idToBase64(NODE)]: [3, 3, 7],
      [idToBase64(GRAPH)]: [3, 6],
      [idToBase64(FUNCTION)]: [4, 2],
      [idToBase64(EASY_LIST_HEADS)]: [4, 1, 7],
      [idToBase64(FN_MAP_VALUES_TO_STRINGS)]: [4, 1, 6],
      [idToBase64(EASY_LOOKUP_NAME)]: [4, 6, 1],
      [idToBase64(EASY_NAME_ID)]: [4, 6, 6],
      [idToBase64(FN_IDENTITY)]: [5, 5],
      [idToBase64(FN_BUILD_ARG_MAPPING)]: [5, 6],
      [idToBase64(ARGUMENT_MAPPING)]: [5, 7],
      [idToBase64(FN_ADD_EDGE)]: [5, 2, 3],
      [idToBase64(Z_NEW_IDS)]: [5, 2, 4],
      [idToBase64(FN_BUILD_ARG_MAPPER)]: [6, 0],
      [idToBase64(NEXT)]: [6, 2],
      [idToBase64(Z_MY_NAME)]: [6, 3],
      [idToBase64(EDGE)]: [6, 7],
      [idToBase64(NODE_IDS)]: [7, 7],
      [idToBase64(PRIMARY_INPUT)]: [7, 2],
      [idToBase64(TAIL)]: [7, 3, 3],
      [idToBase64(ARGUMENT_MAPPED_FN)]: [7, 3, 6],
      [idToBase64(SET)]: [7, 3, 7],
      [idToBase64(NAME)]: [7, 6],
    });
  });
});

describe("byCombo", () => {
  it("should work", () => {
    const nodeIds = Object.values(testIds).map(nodeId => idToBase64(nodeId));
    const { comboMap, getKey } = byCombo(nodeIds, "ASDFJKL:".split(""));

    expect(comboMap).toEqual({
      [idToBase64(FN_NEW_ID)]: ["A"],
      [idToBase64(FN_RESOLVE_MAP)]: ["S", "J"],
      [idToBase64(EASY_RESOLVE_STRING)]: ["S", "F"],
      [idToBase64(Z_YOUR_NAME)]: ["S", "L"],
      [idToBase64(MAP)]: ["S", "D", "F"],
      [idToBase64(STRING)]: ["S", "D", "J"],
      [idToBase64(ID)]: ["D", "A"],
      [idToBase64(HEAD)]: ["D", "D"],
      [idToBase64(DESCRIPTION)]: ["D", "F"],
      [idToBase64(FN_STRING_TO_ID)]: ["D", "J"],
      [idToBase64(Z_ARGS_BY_ID)]: ["D", "K", "D"],
      [idToBase64(FN_BUILD_MAP_ARGS_FN)]: ["D", "K", "K"],
      [idToBase64(LIST)]: ["D", "L", "A"],
      [idToBase64(EASY_LIST_TAILS)]: ["D", "L", "K"],
      [idToBase64(MAIN)]: ["D", ":"],
      [idToBase64(RESOLVE_SET)]: ["F", "S"],
      [idToBase64(Z_BUILD_GREET)]: ["F", "F", "A"],
      [idToBase64(NODE)]: ["F", "F", ":"],
      [idToBase64(GRAPH)]: ["F", "L"],
      [idToBase64(FUNCTION)]: ["J", "D"],
      [idToBase64(EASY_LIST_HEADS)]: ["J", "S", ":"],
      [idToBase64(FN_MAP_VALUES_TO_STRINGS)]: ["J", "S", "L"],
      [idToBase64(EASY_LOOKUP_NAME)]: ["J", "L", "S"],
      [idToBase64(EASY_NAME_ID)]: ["J", "L", "L"],
      [idToBase64(FN_IDENTITY)]: ["K", "K"],
      [idToBase64(FN_BUILD_ARG_MAPPING)]: ["K", "L"],
      [idToBase64(ARGUMENT_MAPPING)]: ["K", ":"],
      [idToBase64(FN_ADD_EDGE)]: ["K", "D", "F"],
      [idToBase64(Z_NEW_IDS)]: ["K", "D", "J"],
      [idToBase64(FN_BUILD_ARG_MAPPER)]: ["L", "A"],
      [idToBase64(NEXT)]: ["L", "D"],
      [idToBase64(Z_MY_NAME)]: ["L", "F"],
      [idToBase64(EDGE)]: ["L", ":"],
      [idToBase64(NODE_IDS)]: [":", ":"],
      [idToBase64(PRIMARY_INPUT)]: [":", "D"],
      [idToBase64(TAIL)]: [":", "F", "F"],
      [idToBase64(ARGUMENT_MAPPED_FN)]: [":", "F", "L"],
      [idToBase64(SET)]: [":", "F", ":"],
      [idToBase64(NAME)]: [":", "L"],
    });

    expect(getKey("AA".split(""))).toEqual(idToBase64(FN_NEW_ID));
    expect(getKey("SFF".split(""))).toEqual(idToBase64(EASY_RESOLVE_STRING));
    expect(getKey("FSK".split(""))).toEqual(idToBase64(RESOLVE_SET));
    expect(getKey("LL".split(""))).toEqual(null);
  });
});
