// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

// General: core booking contract using encrypted data types
contract WorkspaceBookingFHE is SepoliaConfig {
    // small struct for encrypted preference payload
    struct EncryptedPreference {
        uint256 id;
        euint32 encryptedQuietness; // encrypted preference
        euint32 encryptedWindow;    // encrypted preference
        euint32 encryptedDeskType;  // encrypted preference
        uint256 timestamp;
    }

    // encrypted workspace descriptor
    struct EncryptedWorkspace {
        uint256 id;
        euint32 encryptedFeatures; // encrypted bitmask or vector
        euint32 encryptedCapacity; // encrypted numeric
        euint32 encryptedLocation; // encrypted token
        uint256 timestamp;
    }

    // booking record (encrypted pointers)
    struct Booking {
        uint256 id;
        uint256 preferenceId;
        uint256 workspaceId;
        euint32 encryptedPayment; // encrypted payment marker
        bool settled;
        uint256 timestamp;
    }

    // contract state variables
    uint256 public preferenceCount;
    uint256 public workspaceCount;
    uint256 public bookingCount;

    mapping(uint256 => EncryptedPreference) public preferences;
    mapping(uint256 => EncryptedWorkspace) public workspaces;
    mapping(uint256 => Booking) public bookings;

    // matching scores kept encrypted
    mapping(uint256 => euint32) private encryptedMatchScore; // key: bookingId
    mapping(uint256 => bytes32[]) private decryptionRequests; // tracking FHE reqs

    // arrays for bookkeeping
    uint256[] private activePreferenceIds;
    uint256[] private activeWorkspaceIds;

    // Events for off-chain watchers
    event PreferenceSubmitted(uint256 indexed id, uint256 ts);
    event WorkspaceRegistered(uint256 indexed id, uint256 ts);
    event MatchScoreRequested(uint256 indexed bookingId);
    event MatchScoreDecrypted(uint256 indexed bookingId);
    event BookingCreated(uint256 indexed bookingId, uint256 ts);
    event BookingSettled(uint256 indexed bookingId, uint256 ts);

    // modifier placeholder for access control
    modifier onlyOperator() {
        // placeholder: intended for operator checks
        _;
    }

    // constructor placeholder
    constructor() {}

    // add new encrypted preference
    function submitEncryptedPreference(
        euint32 encryptedQuietness,
        euint32 encryptedWindow,
        euint32 encryptedDeskType
    ) public returns (uint256) {
        preferenceCount += 1;
        uint256 newId = preferenceCount;

        preferences[newId] = EncryptedPreference({
            id: newId,
            encryptedQuietness: encryptedQuietness,
            encryptedWindow: encryptedWindow,
            encryptedDeskType: encryptedDeskType,
            timestamp: block.timestamp
        });

        activePreferenceIds.push(newId);
        emit PreferenceSubmitted(newId, block.timestamp);
        return newId;
    }

    // register a workspace with encrypted attributes
    function registerEncryptedWorkspace(
        euint32 encryptedFeatures,
        euint32 encryptedCapacity,
        euint32 encryptedLocation
    ) public onlyOperator returns (uint256) {
        workspaceCount += 1;
        uint256 newId = workspaceCount;

        workspaces[newId] = EncryptedWorkspace({
            id: newId,
            encryptedFeatures: encryptedFeatures,
            encryptedCapacity: encryptedCapacity,
            encryptedLocation: encryptedLocation,
            timestamp: block.timestamp
        });

        activeWorkspaceIds.push(newId);
        emit WorkspaceRegistered(newId, block.timestamp);
        return newId;
    }

    // create a booking pairing a preference with a workspace (encrypted)
    function createBooking(
        uint256 preferenceId,
        uint256 workspaceId,
        euint32 encryptedPaymentMarker
    ) public returns (uint256) {
        require(preferenceId > 0 && preferenceId <= preferenceCount, "Invalid pref");
        require(workspaceId > 0 && workspaceId <= workspaceCount, "Invalid ws");

        bookingCount += 1;
        uint256 bId = bookingCount;

        bookings[bId] = Booking({
            id: bId,
            preferenceId: preferenceId,
            workspaceId: workspaceId,
            encryptedPayment: encryptedPaymentMarker,
            settled: false,
            timestamp: block.timestamp
        });

        emit BookingCreated(bId, block.timestamp);
        return bId;
    }

    // request encrypted matching score from FHE oracle
    function requestMatchScore(uint256 bookingId) public returns (uint256) {
        Booking storage bk = bookings[bookingId];
        require(bk.id != 0, "Booking miss");

        EncryptedPreference storage pref = preferences[bk.preferenceId];
        EncryptedWorkspace storage ws = workspaces[bk.workspaceId];

        bytes32[] memory ciphertexts = new bytes32[](5);
        ciphertexts[0] = FHE.toBytes32(pref.encryptedQuietness);
        ciphertexts[1] = FHE.toBytes32(pref.encryptedWindow);
        ciphertexts[2] = FHE.toBytes32(pref.encryptedDeskType);
        ciphertexts[3] = FHE.toBytes32(ws.encryptedFeatures);
        ciphertexts[4] = FHE.toBytes32(ws.encryptedLocation);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptMatchScore.selector);

        // store mapping from reqId to bookingId via bytes32 encoding
        decryptionRequests[reqId] = ciphertexts;
        emit MatchScoreRequested(bookingId);
        return reqId;
    }

    // callback for decrypted match score
    function decryptMatchScore(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        // verify request mapping exists (best-effort)
        bytes32[] storage stored = decryptionRequests[requestId];
        require(stored.length > 0, "Unknown request");

        // check signatures from FHE
        FHE.checkSignatures(requestId, cleartexts, proof);

        // decode expected result: uint32 score and bookingId (packed by off-chain)
        // off-chain should return: (uint32 score, uint256 bookingId)
        (uint32 score, uint256 bookingId) = abi.decode(cleartexts, (uint32, uint256));

        // store encrypted score as plaintext-encoded euint32 for consistency
        encryptedMatchScore[bookingId] = FHE.asEuint32(score);

        emit MatchScoreDecrypted(bookingId);
    }

    // settle booking after match and payment verification
    function settleBooking(uint256 bookingId, euint32 encryptedSettlementFlag) public returns (bool) {
        Booking storage bk = bookings[bookingId];
        require(bk.id != 0, "No booking");
        require(!bk.settled, "Already settled");

        // placeholder: compare encryptedPayment and encryptedSettlementFlag off-chain
        // persist settlement marker on-chain after off-chain validation
        // using FHE primitives to combine markers
        bk.encryptedPayment = FHE.add(bk.encryptedPayment, encryptedSettlementFlag);
        bk.settled = true;

        emit BookingSettled(bookingId, block.timestamp);
        return true;
    }

    // query encrypted match score
    function getEncryptedMatchScore(uint256 bookingId) public view returns (euint32) {
        return encryptedMatchScore[bookingId];
    }

    // request decryption for a specific encrypted match score
    function requestMatchScoreDecryption(uint256 bookingId) public returns (uint256) {
        euint32 score = encryptedMatchScore[bookingId];
        require(FHE.isInitialized(score), "Score missing");

        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(score);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptMatchScoreReveal.selector);
        decryptionRequests[reqId] = ciphertexts;
        return reqId;
    }

    // reveal decrypted match score callback
    function decryptMatchScoreReveal(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        bytes32[] storage stored = decryptionRequests[requestId];
        require(stored.length > 0, "Unknown request");

        FHE.checkSignatures(requestId, cleartexts, proof);

        // decode (uint32 score, uint256 bookingId)
        (uint32 score, uint256 bookingId) = abi.decode(cleartexts, (uint32, uint256));

        // update encryptedMatchScore with a fresh euint32 representing the revealed score
        encryptedMatchScore[bookingId] = FHE.asEuint32(score);

        emit MatchScoreDecrypted(bookingId);
    }

    // helper: bulk register many workspaces (operator only)
    function bulkRegisterWorkspaces(
        euint32[] memory features,
        euint32[] memory capacities,
        euint32[] memory locations
    ) public onlyOperator returns (uint256) {
        require(features.length == capacities.length && capacities.length == locations.length, "len mismatch");
        uint256 lastId = 0;
        for (uint i = 0; i < features.length; i++) {
            lastId = registerEncryptedWorkspace(features[i], capacities[i], locations[i]);
        }
        return lastId;
    }

    // helper: list active workspace ids
    function listActiveWorkspaces() public view returns (uint256[] memory) {
        return activeWorkspaceIds;
    }

    // helper: list active preference ids
    function listActivePreferences() public view returns (uint256[] memory) {
        return activePreferenceIds;
    }

    // administrative: remove an active preference id (operator)
    function removePreference(uint256 prefId) public onlyOperator {
        // simple removal by marking timestamp = 0
        if (preferences[prefId].id != 0) {
            preferences[prefId].timestamp = 0;
        }
    }

    // administrative: remove workspace
    function removeWorkspace(uint256 wsId) public onlyOperator {
        if (workspaces[wsId].id != 0) {
            workspaces[wsId].timestamp = 0;
        }
    }

    // internal: convert bytes32 to uint256
    function bytes32ToUint(bytes32 b) internal pure returns (uint256) {
        return uint256(b);
    }

    // fallback and receive placeholders
    receive() external payable {}
    fallback() external payable {}
}
