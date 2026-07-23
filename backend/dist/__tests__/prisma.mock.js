"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prismaMock = void 0;
const jest_mock_extended_1 = require("jest-mock-extended");
const index_1 = require("../index"); // Import the real instance that the app uses
jest.mock('../index', () => ({
    __esModule: true,
    prisma: (0, jest_mock_extended_1.mockDeep)(),
}));
exports.prismaMock = index_1.prisma;
beforeEach(() => {
    (0, jest_mock_extended_1.mockReset)(exports.prismaMock);
});
