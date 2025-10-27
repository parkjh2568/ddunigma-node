export class Ddu2048 {
  private readonly dduChar: string[];
  private readonly paddingChar: string;
  private readonly charLength: number;
  // 2048개의 2글자 URL-safe 문자열 (A-Z, a-z, 0-9, -, _ 사용)
  private readonly dduCharDefault: string[] = [
    "1t", "4q", "vX", "dF", "3c", "m9", "F8", "xk",
    "FN", "mu", "y8", "hN", "1H", "ms", "Qp", "Tq",
    "SM", "Fg", "rq", "93", "oZ", "vf", "in", "pc",
    "g8", "Mt", "QI", "A2", "05", "6J", "Tp", "AZ",
    "AJ", "6H", "Fb", "Ms", "_X", "r9", "ax", "Fu",
    "e_", "mX", "Gz", "5b", "mz", "gq", "zv", "W6",
    "np", "da", "KX", "94", "Qv", "Ws", "P_", "1f",
    "LZ", "2m", "BY", "26", "Wp", "gz", "h5", "iq",
    "SG", "SP", "jF", "oN", "VL", "Pt", "hJ", "be",
    "E0", "J5", "Qs", "68", "KF", "l9", "WH", "fj",
    "-D", "Nj", "Ei", "sC", "bF", "rz", "Si", "eV",
    "WJ", "6u", "dx", "y4", "8C", "X9", "yc", "Ln",
    "n1", "-T", "MY", "TP", "1e", "bN", "O6", "TZ",
    "2p", "MA", "p7", "Dl", "eS", "oJ", "C7", "N_",
    "EG", "1x", "L5", "tW", "a2", "xI", "us", "B9",
    "ug", "hT", "dh", "6W", "Bf", "4z", "3F", "xz",
    "9n", "Fq", "xJ", "cU", "8q", "i5", "Yr", "W-",
    "ma", "lL", "mP", "Ev", "Yc", "dJ", "ju", "IJ",
    "pa", "6V", "jR", "jO", "KD", "sG", "-J", "Fn",
    "AC", "Br", "HA", "9a", "OT", "Ja", "-A", "3n",
    "wA", "Mr", "lp", "X6", "1A", "fm", "0V", "gm",
    "fJ", "2O", "Z7", "xA", "Qz", "u0", "YA", "jr",
    "bj", "jf", "7N", "Pw", "J4", "mJ", "Cu", "qw",
    "a0", "-y", "vF", "Yo", "LL", "XF", "dD", "2o",
    "Vh", "uL", "3Z", "rY", "FF", "RU", "OD", "Xp",
    "dT", "hd", "sk", "St", "Ak", "RI", "T5", "hI",
    "Pl", "pW", "FY", "cj", "z7", "XN", "U7", "uV",
    "Sa", "If", "we", "nx", "DK", "c3", "lg", "PW",
    "Fv", "H7", "d3", "nF", "4Y", "PH", "Y3", "oz",
    "pH", "_-", "yf", "OI", "r4", "HV", "9F", "YR",
    "U4", "FJ", "zJ", "UU", "ZF", "HF", "O1", "3T",
    "gb", "h3", "DQ", "KT", "hR", "lq", "E4", "se",
    "kg", "p3", "2h", "Ox", "d2", "mg", "ry", "R8",
    "fv", "j4", "PN", "Bt", "A1", "WB", "c2", "F5",
    "cZ", "1X", "tj", "wY", "yS", "5B", "KE", "RO",
    "rZ", "NP", "Ow", "n8", "FZ", "Gj", "Bn", "b1",
    "iH", "Fm", "qM", "KG", "0X", "Ty", "En", "nL",
    "k1", "qe", "M9", "1S", "V1", "XE", "K2", "J9",
    "-S", "xx", "zH", "j3", "Pa", "6f", "5q", "U2",
    "cI", "JA", "Bi", "aa", "_L", "7w", "hS", "N-",
    "0C", "VD", "7n", "-7", "Ko", "tS", "9c", "Z-",
    "23", "Qr", "9R", "-j", "Q0", "6a", "Je", "A9",
    "eb", "As", "Sf", "YL", "4E", "99", "YS", "Dw",
    "fA", "GH", "X5", "oG", "0E", "8p", "e5", "Fj",
    "Ez", "Nf", "ZB", "Ec", "3x", "RP", "y2", "HK",
    "kc", "3B", "Lp", "eJ", "Ol", "_C", "hk", "NU",
    "yo", "Uj", "X1", "vm", "YP", "co", "kj", "XY",
    "-O", "NK", "9g", "0-", "PU", "Rd", "8g", "yz",
    "CT", "mx", "T9", "Wd", "ZH", "ep", "GB", "cM",
    "Xr", "2P", "wC", "RD", "K9", "iz", "BA", "Jn",
    "9Z", "dL", "F1", "We", "dt", "v2", "yO", "o6",
    "w-", "iG", "Bd", "EN", "DM", "7s", "i8", "7F",
    "MN", "5U", "Du", "9x", "P3", "Cg", "GM", "_s",
    "f1", "Nu", "90", "3j", "51", "cz", "mL", "Zv",
    "-m", "cA", "ja", "46", "qA", "f7", "M7", "Ig",
    "G1", "Ts", "Gi", "p8", "_Y", "Gd", "XS", "CQ",
    "fn", "1W", "Jp", "Is", "pA", "h9", "fB", "iN",
    "k3", "t0", "30", "Ah", "3A", "BG", "O2", "cF",
    "CK", "UT", "8z", "_e", "3X", "8S", "jw", "Dj",
    "N7", "2b", "BH", "2t", "x2", "O9", "UA", "I0",
    "pm", "pG", "64", "p0", "il", "NA", "98", "hx",
    "dM", "xP", "QJ", "Dt", "S6", "QV", "HG", "wU",
    "qg", "ai", "3D", "1E", "xL", "Kz", "T2", "T0",
    "Qn", "gu", "wv", "Ov", "aM", "W4", "-C", "EL",
    "Rg", "G-", "CE", "fO", "3m", "-h", "tf", "Ub",
    "Cj", "oS", "me", "W3", "tR", "FA", "ek", "z8",
    "Tl", "E3", "IA", "Mu", "o1", "3t", "ct", "JT",
    "QK", "7o", "4k", "nq", "ne", "1M", "Xj", "CA",
    "Qt", "Sj", "Or", "Ip", "hL", "cE", "oX", "8L",
    "oy", "rn", "MB", "ha", "My", "5f", "4e", "bi",
    "Vc", "uS", "GQ", "ZU", "Hb", "TE", "Kb", "es",
    "Jd", "BE", "7E", "R5", "2A", "vL", "fT", "ks",
    "dK", "qx", "73", "um", "ds", "p6", "tw", "mQ",
    "pe", "zV", "vB", "ag", "EK", "cQ", "J3", "rD",
    "yh", "eB", "sS", "DZ", "jU", "en", "RS", "JR",
    "9P", "Pq", "0x", "ar", "VR", "lx", "VV", "eX",
    "4H", "w6", "nH", "2f", "rx", "GX", "TD", "Nr",
    "e4", "EM", "cp", "Vo", "13", "J1", "s2", "Q-",
    "p-", "bu", "DN", "Ir", "8w", "fV", "Kx", "Mj",
    "1O", "tJ", "ys", "7L", "nS", "KS", "FM", "Kv",
    "Fs", "96", "uF", "AH", "uW", "Ti", "01", "tC",
    "Zl", "7X", "VF", "Uh", "_y", "Kd", "zS", "hi",
    "0D", "8m", "1m", "eQ", "xw", "bZ", "N5", "vZ",
    "rL", "97", "65", "4N", "tv", "c6", "CG", "2D",
    "B0", "ec", "fP", "yE", "4P", "D-", "8u", "s3",
    "Tn", "3f", "KU", "yK", "86", "HO", "EX", "7Q",
    "Zn", "kp", "Zt", "tA", "SH", "VE", "nT", "cd",
    "3O", "cG", "X3", "n6", "_c", "bC", "Fw", "Ho",
    "Wy", "Sw", "4y", "tG", "iM", "ps", "b0", "BL",
    "6_", "G7", "rb", "iC", "y0", "Mk", "5v", "RW",
    "lP", "mM", "-V", "n3", "5P", "s0", "gC", "OL",
    "sv", "ff", "t1", "u7", "Cv", "EZ", "P9", "VW",
    "Mw", "le", "AR", "Q9", "4c", "yi", "7V", "4D",
    "ng", "7t", "_i", "b3", "6O", "ni", "0T", "NQ",
    "BX", "m0", "xy", "tl", "Ks", "BB", "tn", "O3",
    "5c", "bl", "J2", "Xz", "DA", "DU", "Dx", "Tc",
    "iV", "ZR", "FK", "tL", "4j", "j9", "K_", "v4",
    "X_", "qb", "on", "sF", "PO", "t9", "aD", "H3",
    "Iu", "Pb", "iJ", "Oq", "Cs", "ns", "Zs", "eK",
    "Dq", "dG", "Ly", "sB", "e1", "o2", "uP", "8G",
    "gj", "PV", "j0", "rW", "rN", "Fp", "aj", "HM",
    "Gb", "5G", "VZ", "No", "22", "nP", "CL", "mv",
    "kw", "07", "c9", "Np", "SI", "Yb", "mV", "Pv",
    "Gs", "18", "GR", "D2", "xi", "Yq", "gM", "fQ",
    "Gn", "C4", "IU", "Hg", "Z0", "MI", "UE", "f8",
    "dc", "2T", "I6", "J-", "Ew", "e-", "Bl", "_z",
    "9N", "Vz", "BK", "_t", "Hp", "xs", "Om", "o_",
    "kQ", "MC", "MW", "VQ", "6t", "Ej", "vj", "TA",
    "Hx", "HQ", "Rb", "EQ", "XA", "1a", "hK", "Nd",
    "x8", "LY", "WQ", "vO", "K6", "Wi", "pu", "o4",
    "ll", "RF", "nB", "Rc", "34", "14", "yp", "Xb",
    "ox", "nJ", "AY", "LA", "-a", "2i", "Di", "rI",
    "Dp", "eY", "i_", "a_", "y1", "K5", "Ye", "j5",
    "T6", "-L", "SK", "P5", "Pj", "aE", "7h", "3g",
    "yq", "qW", "zL", "Sy", "Cx", "ON", "-G", "bm",
    "dj", "Td", "xd", "0H", "eq", "3L", "Tv", "Ek",
    "ZO", "1v", "gP", "3Q", "3e", "A-", "xD", "59",
    "S3", "yD", "qf", "gi", "gA", "Dc", "5u", "YB",
    "yl", "bI", "kV", "Pc", "bn", "ss", "Vn", "4U",
    "pf", "Fh", "Hf", "e6", "iE", "sd", "Xu", "wg",
    "Vi", "Zc", "nR", "j_", "ad", "uQ", "_B", "zB",
    "Wj", "sX", "re", "eT", "j-", "3R", "1J", "9A",
    "DB", "fE", "r-", "eN", "zb", "Mo", "Yh", "7P",
    "Em", "19", "ET", "uw", "m5", "ny", "BS", "2j",
    "Qa", "04", "OW", "mY", "Dm", "SV", "0s", "nk",
    "wo", "ql", "Xh", "xG", "2e", "wb", "VP", "XL",
    "Eu", "_A", "39", "gy", "U8", "Rm", "2Z", "au",
    "kL", "yY", "l5", "E9", "An", "Lo", "lF", "SL",
    "mG", "6z", "7a", "px", "0M", "0Z", "Aj", "Id",
    "ac", "It", "sn", "_l", "GS", "b4", "mC", "I9",
    "Pe", "VI", "Bq", "IM", "Mf", "8d", "wz", "5N",
    "eu", "Es", "-8", "xh", "aw", "KY", "Av", "hH",
    "R-", "hA", "4F", "lJ", "6Y", "JL", "Jx", "RC",
    "zs", "24", "A5", "AQ", "xZ", "bJ", "hy", "Uc",
    "lG", "mn", "Dh", "_4", "NX", "Ze", "9T", "kt",
    "40", "kb", "wT", "OJ", "a8", "xr", "x7", "06",
    "QU", "41", "iT", "_g", "nt", "8X", "m-", "RQ",
    "nn", "O0", "Rn", "az", "lO", "TX", "nE", "91",
    "eO", "NB", "Ca", "nm", "AS", "oo", "Lm", "Cm",
    "TR", "D9", "ub", "lw", "E6", "_1", "9E", "d6",
    "OX", "SF", "Jw", "LC", "4t", "9j", "5S", "2L",
    "zn", "Hu", "r8", "fD", "Mm", "NO", "jG", "Jm",
    "O7", "Ut", "Vj", "pd", "qd", "8R", "T8", "7D",
    "pl", "m1", "LO", "rc", "Mv", "qY", "l3", "LT",
    "jY", "IW", "sq", "xg", "HZ", "sh", "mq", "LB",
    "IE", "oD", "xv", "ye", "uc", "Vd", "jx", "Uw",
    "qa", "tz", "iQ", "DO", "FX", "d4", "bb", "Le",
    "H0", "00", "vc", "_R", "pJ", "EY", "EV", "mW",
    "B5", "f-", "UR", "jL", "qk", "gd", "W8", "Qc",
    "qy", "cf", "1Y", "Od", "To", "dC", "fZ", "F9",
    "bf", "Ci", "2k", "9s", "si", "IS", "Mp", "RY",
    "Uq", "hZ", "DC", "Ax", "pj", "nM", "OA", "QW",
    "6A", "mE", "7T", "9_", "Rz", "XR", "Bo", "5L",
    "3s", "ap", "hn", "W2", "kX", "u4", "_F", "bz",
    "q-", "2K", "F0", "G8", "jT", "Xi", "lH", "QE",
    "PB", "cy", "kM", "fs", "hG", "ZK", "DP", "Xn",
    "PM", "mB", "Zh", "Y6", "Qi", "8I", "Ix", "vp",
    "TY", "K0", "JH", "sK", "SJ", "7j", "F4", "Sk",
    "P0", "am", "a4", "Vw", "oB", "UX", "r1", "D6",
    "Oa", "jm", "dW", "mI", "5t", "f4", "Tw", "gY",
    "UV", "bp", "st", "rP", "lY", "aK", "CF", "8b",
    "7R", "21", "gX", "J_", "Ea", "6w", "b5", "wR",
    "ww", "Y-", "v6", "2-", "gl", "0L", "vY", "Lh",
    "Sr", "dw", "gx", "hD", "6X", "yT", "Ri", "c5",
    "Df", "02", "a9", "lK", "z0", "ei", "HI", "A7",
    "kn", "8H", "nv", "C2", "Fy", "G9", "tV", "DS",
    "6K", "TU", "lM", "0w", "MJ", "gs", "Gq", "cT",
    "xH", "uI", "4B", "Jl", "XC", "aV", "Xw", "8e",
    "ze", "0U", "7Y", "ex", "HU", "IV", "zN", "5D",
    "1r", "Rs", "lu", "TN", "TI", "1i", "aN", "3N",
    "-M", "6E", "dv", "TL", "7M", "Ro", "-l", "ci",
    "P7", "Ua", "Mi", "em", "9M", "RJ", "pC", "ko",
    "oW", "Gw", "HC", "rj", "XI", "gT", "KP", "2x",
    "cu", "q_", "FI", "Dk", "rp", "Vr", "Px", "6D",
    "5O", "Hq", "IN", "tT", "Mx", "eH", "9U", "3K",
    "_Z", "V4", "WT", "gW", "3p", "QQ", "t5", "8-",
    "B_", "o7", "i0", "3r", "-0", "pP", "iv", "HP",
    "ov", "nA", "iO", "-P", "Ch", "YU", "LS", "nX",
    "F3", "yF", "Yv", "4G", "ky", "OH", "tk", "R9",
    "YK", "la", "4C", "3-", "TB", "mT", "Hh", "y9",
    "3U", "fS", "M5", "Zx", "pN", "95", "no", "Nt",
    "jv", "l4", "49", "Ui", "dA", "_E", "Vs", "Jt",
    "vM", "iA", "Kw", "9e", "4R", "YZ", "_8", "SD",
    "hU", "-Z", "Xt", "Vv", "fb", "Fz", "R2", "C0",
    "fi", "pk", "-p", "e9", "Ld", "cL", "Lb", "PT",
    "bs", "-U", "Eo", "1u", "BJ", "JW", "_f", "Ka",
    "cw", "Dg", "YQ", "Go", "tx", "6r", "1g", "xu",
    "gG", "ZV", "IT", "Qw", "U-", "EP", "zM", "l6",
    "jQ", "sY", "rK", "5s", "w5", "HT", "zm", "ZG",
    "M1", "1l", "m_", "dm", "l2", "Of", "_J", "ph",
    "dR", "py", "gH", "kh", "O5", "ru", "Bj", "BO",
    "de", "SA", "wj", "KQ", "9z", "e2", "Nw", "yZ",
    "oV", "T_", "I1", "QN", "uq", "sw", "mr", "DW",
    "AL", "1V", "MS", "WG", "hj", "3i", "Fl", "SB",
    "yn", "fH", "S_", "S7", "q0", "rk", "gZ", "25",
    "-R", "Li", "gw", "y7", "nO", "o9", "BV", "pS",
    "8Q", "ga", "u6", "nr", "F6", "OZ", "zE", "Lx",
    "wy", "Fi", "J0", "WX", "RM", "iZ", "o-", "bc",
    "_S", "mN", "I7", "Rk", "M-", "Vb", "78", "sI",
    "ur", "F7", "UH", "kE", "o5", "aU", "fI", "5d",
    "RV", "Y0", "Tx", "A0", "vS", "ul", "Wh", "Bp",
    "Qx", "gt", "HW", "hq", "wE", "Hd", "Qh", "4T",
    "nZ", "Sn", "Xx", "Mh", "rA", "5-", "7i", "2V",
    "CO", "7C", "HH", "8x", "CI", "1N", "HL", "yW",
    "fK", "9L", "ew", "uE", "9G", "jJ", "1G", "0h",
    "6P", "r6", "-z", "WE", "rs", "Bw", "jK", "JB",
    "th", "Dd", "KW", "HE", "rU", "nI", "qK", "fM",
    "AV", "Sd", "ZX", "_k", "b9", "--", "J7", "H2",
    "JN", "Cy", "N6", "yG", "j2", "NY", "q1", "D8",
    "jo", "US", "cJ", "eC", "_6", "b_", "oU", "YH",
    "Bb", "Ae", "RT", "8s", "yx", "OE", "Ym", "im",
    "kP", "ya", "7z", "uo", "R0", "WD", "DH", "mo",
    "6T", "55", "L-", "yN", "cN", "sJ", "Pi", "LN",
    "WU", "ke", "uK", "wt", "rO", "eP", "FH", "IP",
    "qL", "yR", "jD", "1z", "aC", "28", "a-", "pb",
    "2B", "5o", "vG", "Yg", "ln", "OR", "kx", "On",
    "cq", "54", "wi", "dQ", "Xg", "7K", "vv", "bP",
    "t_", "OS", "CM", "G5", "Xf", "ir", "fR", "1P",
    "Z8", "K4", "ii", "ml", "Mz", "xc", "c0", "xT",
    "XK", "n_", "Zj", "Rh", "zD", "V0", "sl", "ux",
    "Gv", "V-", "Ha", "Ib", "Lq", "sp", "FS", "ti",
    "_d", "0i", "vD", "V2", "W7", "4r", "bL", "6R",
    "Pf", "BZ", "q2", "qT", "8Z", "E8", "9J", "5M",
    "VN", "nc", "IO", "ZT", "if", "Zr", "_p", "g5",
    "lR", "H9", "Yl", "cS", "N8", "ab", "36", "aG",
    "cP", "4v", "wl", "Q5", "NW", "2G", "wh", "lN",
    "5p", "GN", "IR", "KB", "IC", "rB", "_r", "Gg",
    "cx", "wW", "LP", "4x", "eG", "lc", "zK", "x0",
    "Va", "29", "UF", "Sq", "rt", "j8", "JE", "a1",
    "V5", "c1", "vU", "4S", "bk", "uy", "lX", "2C",
    "Jf", "Ey", "Uy", "L0", "Xd", "pR", "AX", "Zm",
    "Mb", "H6", "Xm", "MR", "hv", "7H", "Er", "xM",
    "ML", "iF", "Y9", "VM", "Ra", "4f", "MD", "52",
    "7_", "A4", "ob", "8_", "nQ", "ue", "SS", "8P",
    "Nh", "sR", "H_", "9h", "0f", "eU", "6d", "vx",
    "82", "7e", "ZW", "ym", "yu", "db", "WA", "OC",
    "P1", "1j", "Nq", "sM", "ZJ", "8O", "G3", "I8",
    "zq", "bd", "Xq", "Su", "ZQ", "XH", "sQ", "pV",
    "os", "5l", "Ou", "TG", "Cd", "8r", "2F", "_U",
    "fw", "Jq", "Kr", "6j", "ID", "YG", "BU", "fr",
    "YJ", "_H", "bD", "wf", "ty", "ZZ", "PS", "sz",
    "j7", "eW", "ji", "UK", "9q", "7c", "Ai", "El",
    "Ba", "dp", "Kk", "n2", "SZ", "b6", "RH", "3o",
    "3H", "4J", "9v", "WY", "Y_", "LV", "1Q", "5k",
    "BI", "_M", "4I", "po", "kS", "Tm", "80", "tZ",
    "BQ", "AI", "M3", "fF", "CN", "V9", "ZD", "qp",
    "ie", "CZ", "Fa", "nd", "1I", "go", "kK", "qP",
    "h_", "u5", "UN", "9S", "RE", "aI", "YN", "FL",
    "Qo", "wH", "8a", "QZ", "t8", "Zu", "qt", "k4",
    "wn", "Po", "bH", "Iw", "ZN", "lb", "tq", "sj",
    "ri", "FO", "hF", "BD", "Sc", "sP", "kq", "io",
    "Kl", "wO", "rr", "JF", "mp", "sD", "kZ", "r5",
    "qX", "sf", "E1", "bA", "Ok", "zx", "hp", "aF",
    "1L", "_5", "3q", "wx", "Ki", "fa", "Yt", "Jr",
    "Hy", "-b", "qm", "N4", "pi", "eL", "7v", "OU",
    "Ob", "NC", "Eq", "Tf", "6S", "rM", "V3", "E5",  ];
  private readonly paddingCharDefault: string = "0u";
  private readonly defaultEncoding: BufferEncoding = "utf-8";

  private readonly binaryLookup: string[] = Array.from(
    { length: 256 },
    (_, i) => i.toString(2).padStart(8, "0")
  );
  private readonly dduBinaryLookup: Map<string, number> = new Map();
  private readonly dduBinaryLookupKr: Map<string, number> = new Map();
  private readonly paddingRegex: Map<string, RegExp> = new Map();

  constructor(dduChar?: string[], paddingChar?: string) {
    // 기본값 설정
    const sourceChar = dduChar || this.dduCharDefault;
    const sourcePadding = paddingChar || this.paddingCharDefault;

    // 유효성 검사: 최소 2048개 이상의 문자 필요
    if (sourceChar.length < 2048) {
      throw new Error(`Ddu2048 requires at least 2048 characters in the character set. Provided: ${sourceChar.length}`);
    }

    // 첫 번째 문자의 길이를 기준으로 설정
    this.charLength = sourceChar[0].length;

    // 모든 문자의 길이가 동일한지 검사
    for (let i = 0; i < sourceChar.length; i++) {
      if (sourceChar[i].length !== this.charLength) {
        throw new Error(`All characters must have the same length. Expected: ${this.charLength}, but character at index ${i} ("${sourceChar[i]}") has length ${sourceChar[i].length}`);
      }
    }

    // 패딩 문자 길이 검사
    if (sourcePadding.length !== this.charLength) {
      throw new Error(`Padding character length (${sourcePadding.length}) must match character set length (${this.charLength})`);
    }

    // 중복 검사
    const uniqueChars = new Set(sourceChar);
    if (uniqueChars.size !== sourceChar.length) {
      throw new Error(`Character set contains duplicate characters. Unique: ${uniqueChars.size}, Total: ${sourceChar.length}`);
    }

    // 패딩 문자가 문자셋에 포함되어 있는지 검사
    if (uniqueChars.has(sourcePadding)) {
      throw new Error(`Padding character "${sourcePadding}" cannot be in the character set`);
    }

    // 앞에서부터 정확히 2048개만 사용
    this.dduChar = sourceChar.slice(0, 2048);
    this.paddingChar = sourcePadding;

    // 룩업 테이블 생성
    this.dduChar.forEach((char, index) =>
      this.dduBinaryLookup.set(char, index)
    );
    this.dduCharDefault.forEach((char, index) =>
      this.dduBinaryLookupKr.set(char, index)
    );

    this.paddingRegex.set("default", new RegExp(this.escapeRegExp(this.paddingChar), "g"));
    this.paddingRegex.set("KR", new RegExp(this.escapeRegExp(this.paddingCharDefault), "g"));
  }

  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private *splitString(s: string, length: number): Generator<string> {
    for (let i = 0; i < s.length; i += length) {
      yield s.slice(i, Math.min(i + length, s.length));
    }
  }

  private getSelectedSets(
    dduSetSymbol: string
  ): {
    dduSet: string[];
    padChar: string;
    lookupTable: Map<string, number>;
    paddingRegExp: RegExp;
  } {
    const isKR = dduSetSymbol === "KR";
    const dduSet = isKR ? this.dduCharDefault : this.dduChar;
    const padChar = isKR ? this.paddingCharDefault : this.paddingChar;

    return {
      dduSet,
      padChar,
      lookupTable: isKR ? this.dduBinaryLookupKr : this.dduBinaryLookup,
      paddingRegExp: this.paddingRegex.get(isKR ? "KR" : "default")!,
    };
  }

  private bufferToDduBinary(
    input: Buffer
  ): { dduBinary: string[]; padding: number } {
    const encodedBin = input.reduce(
      (acc, byte) => acc + this.binaryLookup[byte],
      ""
    );
    if (encodedBin.length === 0) {
      return { dduBinary: [], padding: 0 };
    }
    const bitLength = 11; // 2048 = 2^11
    const dduBinary = Array.from(this.splitString(encodedBin, bitLength));
    const padding = bitLength - dduBinary[dduBinary.length - 1].length;

    if (padding > 0) {
      dduBinary[dduBinary.length - 1] += "0".repeat(padding);
    }

    return { dduBinary, padding };
  }

  private dduBinaryToBuffer(decodedBin: string, paddingBits: number): Buffer {
    if (paddingBits > 0) {
      decodedBin = decodedBin.slice(0, -paddingBits);
    }
    const buffer: number[] = [];
    for (let i = 0; i < decodedBin.length; i += 8) {
      buffer.push(parseInt(decodedBin.slice(i, i + 8), 2));
    }

    return Buffer.from(buffer);
  }

  encode(
    input: Buffer | string,
    options: {
      dduSetSymbol?: string;
      encoding?: BufferEncoding;
    } = {}
  ): string {
    const {
      dduSetSymbol = "default",
      encoding = this.defaultEncoding,
    } = options;
    const bufferInput =
      typeof input === "string" ? Buffer.from(input, encoding) : input;

    const { dduSet, padChar } = this.getSelectedSets(dduSetSymbol);
    const { dduBinary, padding } = this.bufferToDduBinary(bufferInput);

    let resultString = "";

    // 각 11비트 청크를 charLength 글자 문자열로 변환
    for (const binaryChunk of dduBinary) {
      const charInt = parseInt(binaryChunk, 2);
      resultString += dduSet[charInt];
    }

    // 패딩 비트 정보를 padChar + 패딩비트수(0-10) 형태로 추가
    // padding이 0이 아니면 padChar를 추가
    if (padding > 0) {
      resultString += padChar + padding;
    }
    
    return resultString;
  }

  decode(
    input: string,
    options: {
      dduSetSymbol?: string;
      encoding?: BufferEncoding;
    } = {}
  ): string {
    const {
      dduSetSymbol = "default",
      encoding = this.defaultEncoding,
    } = options;
    const { lookupTable, padChar } = this.getSelectedSets(dduSetSymbol);

    // 패딩 정보 추출
    let paddingBits = 0;
    const padCharIndex = input.indexOf(padChar);
    if (padCharIndex >= 0) {
      // padChar 이후의 숫자가 패딩 비트 수
      const paddingStr = input.substring(padCharIndex + padChar.length);
      paddingBits = parseInt(paddingStr) || 0;
      // 패딩 정보 제거
      input = input.substring(0, padCharIndex);
    }

    let dduBinary = "";

    // charLength 길이만큼 읽어서 디코딩
    for (let i = 0; i < input.length; i += this.charLength) {
      const charChunk = input.slice(i, i + this.charLength);
      const charIndex = lookupTable.get(charChunk);
      if (charIndex === undefined)
        throw new Error(`Invalid character: ${charChunk}`);
      dduBinary += charIndex.toString(2).padStart(11, "0");
    }

    const decoded = this.dduBinaryToBuffer(dduBinary, paddingBits);

    return decoded.toString(encoding);
  }
}

